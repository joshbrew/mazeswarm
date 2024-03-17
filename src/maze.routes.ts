import { AStarSolver } from './maze/astar';
import { Maze } from './maze/maze'
import { FlowField } from './maze/flowfield'

import { generateHuntAndKillWithBraidsMaze, noDeadEndsSpiral } from './maze/generators'
import { WorkerService, isTypedArray } from 'graphscript';
import { PhysicsEntityProps, PhysicsMesh } from './types';
import RAPIER from '@dimforge/rapier3d-compat';

export const mazeRoutes = {

    //lets use the hunt and kill with braids octagonal configuration, we need square and octagonal cells
    createMaze:async function(
        width=20,
        height=20,
        type:'huntandkill'|'spiral'='huntandkill',
        seed,
        allowDiagonal,
        nFields = 7, //number of flowfields, field 0 targets player, rest of fields reserved for w/e
        nEntities = 300,
        physicsPort:any, //port between render thread and physics thread
        navPhysicsPort:any, //port id for thread dedicated to convolving the flowfields so we can scale them better
        minimapPort:any,
        minimapCanvas:OffscreenCanvas
    ) {

        let generator = type === 'huntandkill' ? generateHuntAndKillWithBraidsMaze : noDeadEndsSpiral;
        //create a maze grid with a desired generator function,
        let maze = new Maze(width,height,generator,()=>{},seed,allowDiagonal);

        const navThread = (this.__graph as WorkerService).workers[navPhysicsPort];
        const renderThread = (this.__graph as WorkerService).workers[physicsPort];
        const minimapThread = (this.__graph as WorkerService).workers[minimapPort];

        if(!navThread || !renderThread) {
            console.error("y u no supply correct info");
            return undefined;
        }

        //create/set player at maze start
        if(this.__graph.get("player")) 
            renderThread.post(
                'updatePhysicsEntity', [
                "player", 
                    {
                        position:{y:0.1, x:maze.start.x-0.5, z:maze.start.y-0.5}
                    }
                ]); //remove any previous
        else {
            await renderThread.run('addEntity',{ //will call back to this thread to add the physics entity
                _id:"player",
                dynamic:true,
                collisionType:'capsule',
                radius:0.1,
                halfHeight:0.1,
                ccd:true,
                diffuseColor:{
                    r:1,g:0.5,b:0
                },
                position:{
                    y:0.4, x:maze.start.x-0.5, 
                    z:maze.start.y-0.5
                }, //get random start cell position, place within inner 5x5 block of a 7x7 block
                //instance:true
            } as PhysicsEntityProps); //could facilitate multiplayer easily but we don't need that problem rn

            //add player controls
            renderThread.post(
                'addPlayerControls',
                [
                    'addPlayerControls', 
                    'player', 
                    1,  //walk speed
                    'firstperson'
                ]
            );
        }
          
        //generate flowfields for dynamic behaviors
        let fields = new Array(nFields);
        for(let i = 0; i < nFields; i++) {
            fields[i] = (this.__graph as WorkerService).add({
                __node:{tag:'flowfield'+i},
                __props: new FlowField({ //proxy the flowfield on the graph
                    maze,
                    allowDiagonal,
                    avoidance:2,
                    avoidanceDampen:0.75
                })
            })
        }        

        
        //proxy the flowfields on the navThread for updating
        if(navPhysicsPort) {
            const costFields = fields.map((f) => new Float32Array(f.costField));
            navThread.post(
                'mirrorFlowField',
                [costFields, fields[0].width, fields[0].height, allowDiagonal]
            );
        } 

        function getRandomCell(
            start,
            end,
            excludeRangeFromStart = 2, 
            tries=0, 
            maxTries=10
        ) {
            tries++;
            let x = Math.floor(Math.random()*maze.width);
            let y = Math.floor(Math.random()*maze.height);

            if(tries < maxTries && 
                (Math.abs(start.x - x) <= excludeRangeFromStart && Math.abs(start.y - y) <= excludeRangeFromStart)) {
                return getRandomCell(
                    start,
                    end,
                    excludeRangeFromStart, 
                    tries, 
                    maxTries
                ); //keep trying
            }
            
            if(tries >= maxTries) {
                x = end.x;
                y = end.y; //babylonjs is lefthanded or something so z is y in our case (little confusing)
            }   

            return {x,y};
        }


        const player = this.__graph.get("player") as RAPIER.RigidBody;
        const position = player.translation();

        //start in middle of cell
        navThread.run(
            "updateFlowField",
            [
                0,
                position.x+1,
                position.z+1
            ]
        ).then(
            (field) => {
                fields[0].costField = field.costField; 
                fields[0].flowField = field.flowField;
            }
        );

        this.__graph.maze = maze;
        this.__graph.fields = fields;

        let doors = [
            'red',
            'cyan',
            'green'
        ];
        
        //assign maze information to meshes for correlating raycasts, otherwise we will use worldspace to correlate
        maze.addDoorsAndKeys(
            maze.start,
            maze.end,
            doors,
            Math.floor(Math.min(width,height)/doors.length),
            allowDiagonal,
            'last'
        );

        const cellData = maze.getCellData();
        //make sure maze 3d renders doors and keys by changing material colors and adding entities, add interactions 
        renderThread.post('renderMaze', [
            {
                cells:cellData,
                width:maze.width,
                height:maze.height
            }, allowDiagonal]
        );

        
        minimapThread.post('duplicateMaze',[cellData,true]);
        minimapThread.post('render2dMaze',minimapCanvas,undefined,[minimapCanvas]);


        let search = new AStarSolver(maze);

        let cells = [] as ({x:number,y:number})[];
        for(let i = 1; i < nFields; i++) {
            //set goals in pairs?
            let xy = getRandomCell(maze.start,maze.end);
            //console.log(xy);
            navThread.run("updateFlowField",[i,xy.x,xy.y]).then((field) => {
                fields[i].costField = field.costField; //we just need the costs to update the physics entities
                fields[i].flowFieldX = field.flowFieldX;
                fields[i].flowFieldY = field.flowFieldY;
            });
            cells.push(xy); 
        }

        //field i+1 can access fields j,
        let accessible = [] as number[][];

        cells.forEach((cell,i) => {
            accessible.push([]);
            cells.forEach((cell2,j) => {
                if(i === j) return;
                let path = search.solve(cell.x,cell.y,cell2.x,cell2.y,allowDiagonal,{keys:{}}); //assume no keys
                if(path?.[path.length-1].x === cell2.x && path?.[path.length-1].y === cell2.y) {
                    accessible[i].push(j); //
                }
            });
        });

        this.__graph.flowCells = cells;
        this.__graph.accessible = accessible;


        //now lets set which cells are accessible to each other cell

        //field 0 will be reserved for tracking the player
        //fields 1+ will have destination pairs that are reachable, we will use this to have the AI randomly move around if not tracking player
        //entity field assignments should only apply to fields where the cell the entity is on is not static


        //listen to world updates to send to flowfield
         
        this.__graph.blorbs = []; //SWAP TO SOLID PARTICLE SYSTEM

        let prom;
        
        //let p_r = new Float32Array(nEntities * 7); 
        //let pSettings = [] as any[];
        for(let i = 0; i < nEntities; i++) {
            let _id = 'blorb_'+i;
            const j = i * 7; //p_r offset
            let randomCell = getRandomCell(maze.start,maze.end, (maze.width > 5 && maze.height > 5) ? 3 : 1);

            randomCell.x += Math.random()*(3/7) + 2/7; //offset x and y within the 3x3 center of the cells
            randomCell.y += Math.random()*(3/7) + 2/7;
 
            //todo not all should get a start field
            let startField = nFields > 1 ? Math.floor(Math.random()*(nFields-1)) || 1 : 0; 

            // p_r[j] = randomCell.x - 1; //x
            // p_r[j+1] = 0.2;              //y
            // p_r[j+2] = randomCell.y - 1; //z
            
            // pSettings.push({
            //     field:Math.random() > 0.5 ? startField : undefined
            // })
            
            if(physicsPort) {//clear previous
                if(this.__graph.get(_id)) 
                    renderThread.post('removeEntity', _id); //remove any previous
    
                const entitySettings = { //will call back to this thread to add the physics entity
                    _id,
                    dynamic:true,
                    collisionType:'ball',
                    radius:0.05,
                    mass:10,
                    position:{y:0.2, x:randomCell.x - 1, z:randomCell.y - 1}, //get random start cell position, place within inner 5x5 block of a 7x7 block
                    instance:true,
                    field:Math.random() > 0.5 ? startField : undefined
                }
            
                if(i === nEntities - 1)
                    prom = renderThread.run('addEntity',entitySettings);
                else
                    renderThread.post('addEntity',entitySettings)


            } else {
                //just apply to physics thread, not necessary rn since we loop thru render thread anyway
            }
        }

        // await renderThread.run('createSolidParticleSystem',[
        //     nEntities,
        //     { //will call back to this thread to add the physics entity
        //         _id:'blorb',
        //         collisionType:'ball',
        //         dynamic:true,
        //         radius:0.05,
        //         mass:10,
        //         //instance:true,
        //         //field:Math.random() > 0.5 ? startField : undefined
        //     },
        //     p_r,
        //     pSettings
        // ]);

        let r = await prom;
        console.log(r);
        
        for(let i = 0; i < nEntities; i++) {
            const _id = 'blorb_'+i; //todo: generalize
            this.__graph.blorbs.push(this.__graph.get(_id));
        }

        //await Promise.all(proms); //entity promises (not most efficient)


        let animation; 
        let anim = () => {
            this.__graph.run('updatePhysicsEntitiesFromFlowFields', 1);
            animation = requestAnimationFrame(anim);
        }

        animation = requestAnimationFrame(anim);

        let playerTracking;

        let timeout = () => {
            const player = this.__graph.get("player") as RAPIER.RigidBody;
            const position = player.translation();

            //start in middle of cell
            navThread.run(
                "updateFlowField",
                [
                    0,
                    position.x+1,
                    position.z+1
                ]
            ).then(
                (field) => {
                    fields[0].costField =  field.costField; 
                    fields[0].flowFieldX = field.flowFieldX;
                    fields[0].flowFieldY = field.flowFieldY;
                }
            );

            playerTracking = setTimeout(timeout, 500);// 500ms updates to flowfield
        }

        playerTracking = setTimeout(timeout,500);


        renderThread.post(
            'addPlayerControls', 
            [
                'player', 
                2, 
                'topdown'
            ]
        );
        // setTimeout(()=>{
        //     renderThread.post(
        //         'addPlayerControls', 
        //         [
        //             'player', 
        //             2, 
        //             'topdown'
        //         ]
        //     );
        // },1000)
        



        //create instances to represent maze grid, figure out a lighting solution

        /**
         * Lighting ideas:
         * 
         * 1. Shrink edges of some cells so allow an underneath light through
         * 
         * 2. Or use the mesh assignment tool for lights to generate a few dozen scattered around
         * 
         * 3. Keep a dim global light
         * 
         * 4. Player illuminates cone in front of them with a flashlight or something.
         * 
         * 5. Add some haze and tune frustum culling for performance
         * 
        **/

        //populate maze with doors and keys and ai

        //create corresponding flowfield(s)

        //have ai track on the player's location

        //ai activate on player sight, use ray or sphere casts

        //send maze data to render thread to initialize the render
        return true;
    },

    duplicateMaze:function(celldata,allowDiagonal) {
        let maze = new Maze();
        maze.setCellData(celldata,allowDiagonal);

        //console.log(maze);

        this.__graph.maze = maze;
    },

    render2dMaze:function(canvas?:OffscreenCanvas|HTMLCanvasElement) {
        if(canvas) this.__graph.minimap = canvas; //offscreencanvas
        if(!this.__graph.minimapctx) this.__graph.minimapctx = canvas?.getContext('2d');

        const maze = this.__graph.maze as Maze;
        maze.usingDoors = true;
        if(!maze) return;

        maze.draw(this.__graph.minimapctx, this.__graph.minimap.width/maze.width, 'violet', false, true, false, true);
    },

    getPlayerCell:function(cellSize=1, flowField=false) {
        //get cell current player is in in the maze
        //const maze = this.__graph.maze; 
        const player = this.__graph.get("player") as RAPIER.RigidBody;

        let p = player.translation();
        
        let x,y;
        if(flowField) { //e.g. to update flowfield with current player position
            x = Math.floor(p.x*7/cellSize);
            y = Math.floor(p.z*7/cellSize);

        } else {
            x = Math.floor(p.x/cellSize);
            y = Math.floor(p.z/cellSize);
        }

        return {x,y};

    },

    //reset maze and flow fields etc
    resetMaze: function() {

    },

    mirrorFlowField: function(
        costFields:{[key:string]:Float32Array}, 
        width, 
        height,
        allowDiagonal
    ) {
        for(const key in costFields) {
            const field = this.__graph.get(key);
            if(!field) {
                let newfield = this.__graph.add({
                    __node:{tag:key},
                    __props:new FlowField({
                        width,
                        height,
                        costField:costFields[key],
                        allowDiagonal,
                        avoidance:2,
                        avoidanceDampen:0.55
                    })
                });
                if(!this.__graph.fields) this.__graph.fields = [];
                this.__graph.fields[parseInt(key)] = newfield;
            } else {
                (field as FlowField).setCostField(
                    costFields[key],
                    width,
                    height,
                    allowDiagonal
                );
            }
        }
    },

    updateFlowField:function(
        field,
        targetX,targetY,
        scaledToFlowField=false
    ){
        //when user goes to a new cell, update the flow field
        let flowfield = this.__graph.fields[field] as FlowField;

        if(!scaledToFlowField) { //put in center of flowfield cell block
            targetX *= 7;
            if(targetX % 7 === 0) targetX += 4;
            targetY *= 7;
            if(targetY % 7 === 0)  targetY += 4;
        }

        if(flowfield) {
            //console.log(targetX, targetY);
            //console.log(targetX,targetY);
            flowfield.updateField(Math.floor(targetX),Math.floor(targetY));
        }

        //todo: performance
        return {
            costField:new Float32Array((flowfield.costField as Float32Array)), 
            flowFieldX:new Float32Array((flowfield.flowFieldX as Float32Array)), 
            flowFieldY:new Float32Array((flowfield.flowFieldY as Float32Array))
        }; 
        //return the costField update if we need to update proxy on physics thread from nav thread
    },

    //set the field the entity corresponds to
    setEntityField:function(
        entity:string,
        field:number
    ) {
        let e = this.__graph.get(entity);

        if(e) 
            e.field = field;
    },

    //we should update all of the entities velocities based on flowfield position and report to physics thread to then report back to the render thread
    updatePhysicsEntitiesFromFlowFields:function(
        cellSize = 1
    ) {
        //update velocities according to the active flowfield(s) assigned to the entities

        //perhaps add some boiding behaviors
        const fields = this.__graph.fields;
        const flowCells = this.__graph.flowCells; 
        const accessible = this.__graph.accessible; 
        //accessible[i] = cells accessible from field i+1, use this to update destination of entities upon reaching prev destination  (within 2 cells)

        const world = this.__graph.world; 

        let player = this.__graph.get('player');
        let player_p = player.translation();

        if(world) {
            this.__graph.blorbs.forEach((entity) => {
                
            //for(let i = 0; i < nEntities; i++) {
                //const _id = 'blorb'+i; //todo: generalize
                //let entity = this.__graph.get(_id) as RAPIER.RigidBody & { field: number, contacts:string[] };
                const position = entity.translation();              
                if(
                    Math.abs(position.x-player_p.x) < 1.5 && //if we're in the cell of the destination of the field
                    Math.abs(position.z-player_p.z) < 1.5
                ) {
                    entity.field = 0;
                }

                if(!entity || typeof entity.field !== 'number') return;
                //console.log(_id);
                let fieldX = Math.floor(position.x*7/cellSize)+7;
                let fieldY = Math.floor(position.z*7/cellSize)+7;

                //swap flowfield to next available when reaching ai goal
                if(entity.field !== 0) {
                    const flowCell = flowCells[entity.field-1];
      
                    //console.log(entity.field,flowCell,flowCells,fields[entity.field]);
                    if( entity.field !== 0 && //if we're not tracking the player (field 0)
                        Math.abs(position.x-flowCell.x) < 1.5 && //if we're in the cell of the destination of the field
                        Math.abs(position.z-flowCell.y) < 1.5
                    ) {
    
                        //new field
                        let off = 1;
                        let newFieldIdx = entity.field - off;
                        if(newFieldIdx < 1) {
                            newFieldIdx = fields.length - 2;
                        }
                        let a = accessible[newFieldIdx];
                        while(a.length < 1) {
                            newFieldIdx--;
                            if(newFieldIdx === 0) newFieldIdx = fields.length - 2;
                            a = accessible[newFieldIdx];
                            //todo give up if rotating thru but this should not be the case in our solution
                        }
                        const newField = a[Math.floor(Math.random()*a.length)];
                        entity.field = newField; //new destination
                        //console.log('new goal',newField,_id);
                    }
                }
  
                const field = fields[entity.field] as FlowField;

                const idx = field.index(fieldX,fieldY);
                const directionX = (field.flowFieldX as Float32Array)[idx];
                const directionY = (field.flowFieldY as Float32Array)[idx];
                let cost = field.costField[idx];

                if ((directionX !== 0 || directionY !== 0) && cost !== 0 && cost !== Infinity) {
                    const impulse = 0.5 / cost; //scale according to time tick too

                    //console.log(direction,cost);

                    let y = 0;
                    //console.log(entity.contacts, _id);
                    if(entity.contacts?.length > 0) {
                        //console.log(entity.contacts)
                        if(entity.contacts.find((v)=>{
                            if(v.includes('blorb')) return true;
                        })) {
                            y = 3*impulse;
                        }
                    }

                    entity.lastImpulse = {
                        x:impulse*directionX,
                        z:impulse*directionY, //z is y in babylonjs at based on our logic
                        y
                    };

                    entity.applyImpulse(entity.lastImpulse, true);
                }
            //}
            
            });
        }
        //  else if(positions && isTypedArray(positions)) {
        //     let offset = 3; //x0,y0,z0,x1,y1,z1
        //     for(let i = 0; i < positions.length/3; i++) {
        //         let j = i*offset;
        //         let field = this.__graph.entities?.[i]?.field;
                
        //     }
        // }
        
    }

};


//todo: enemies nibble toes and make you shorter till ur ded, should be funny and creepy
// screen shake effect by number of enemies chasing
// dynamic audio for playing tracks based on numbers of enemies tracking