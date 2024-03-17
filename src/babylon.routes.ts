import {
    workerCanvasRoutes, 
    remoteGraphRoutes, 
    CanvasProps, 
    WorkerCanvas, 
    isTypedArray, 
    WorkerInfo,
    WorkerService,
    //recursivelyAssign,
} from 'graphscript'

import * as BABYLON from 'babylonjs'
import { PhysicsEntityProps, Vec3 } from '../src/types';

import { navMeshRoutes } from './navmesh.routes';

import { Maze } from './maze/maze';

declare var WorkerGlobalScope;

export type PhysicsMesh = (BABYLON.Mesh | BABYLON.InstancedMesh) & { 
    contacts?:string[], 
    dynamic?:boolean | "kinematicP" | "kinematicV" , collisionType?:string, navMesh?:boolean, 
    crowd?:string, agentState?:string|number, patrol?:Vec3[], origin?:Vec3,
    field?:number
};

function recursivelyAssign (target,obj) {
    for(const key in obj) {
        if(obj[key]?.constructor.name === 'Object') {
            if(target[key]?.constructor.name === 'Object') 
                recursivelyAssign(target[key], obj[key]);
            else target[key] = recursivelyAssign({},obj[key]); 
        } else {
            target[key] = obj[key];
            //if(typeof target[key] === 'function') target[key] = target[key].bind(this);
        }
    }

    return target;
}

// let cv = document.createElement('canvas');
// let off = cv.transferControlToOffscreen();

// new BABYLON.DynamicTexture('mycanvas',{canvas:cv});

export const babylonRoutes = {
    ...workerCanvasRoutes,
    ...remoteGraphRoutes,
    receiveBabylonCanvas:async function(
        options:CanvasProps
    ) {

        const BabylonCanvasProps = {
            BABYLON,
            init:function (ctx:WorkerCanvas,canvas) {
        
                if(typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
                    //this is a hack
                    globalThis.document.addEventListener = (...args:any[]) => {
                        canvas.addEventListener(...args);
                    }
                }
                 
                //const engine = new BABYLON.WebGPUEngine(canvas);//new BABYLON.Engine(canvas);
                const engine = new BABYLON.Engine(canvas);
                //return new Promise((res) => {
                //    engine.initAsync().then(()=>{
                        const scene = new BABYLON.Scene(engine);
                        scene.clearColor = new BABYLON.Color4(0,0,0,1);
                        ctx.engine = engine;
                        ctx.scene = scene;
                        ctx.camera = this.__graph.run('attachFreeCamera', ctx);
                        ctx.animations = {};

                        ctx.keys = {}; //for maze key objects
                        ctx.doors = {}; //for maze door objects

                        ctx.playerHP = 10; //10 seconds of contact time

                        const cameraControls = this.__graph.run('addCameraControls', 0.5, ctx); //default camera controls
        
                        canvas.addEventListener('resize', () => { 
                            engine.setSize(canvas.clientWidth,canvas.clientHeight); //manual resize
                        });
        
                        //update internal scene info
                        canvas.addEventListener('mousemove', (ev) => {
                            scene.pointerX = ev.clientX;
                            scene.pointerY = ev.clientY;
                        });
        
                        //scene picking
                        canvas.addEventListener('mousedown', (ev) => {
                            let picked = scene.pick(scene.pointerX, scene.pointerY);
        
                            if(picked.pickedMesh?.name === 'player' && ctx.controls?.mode !== 'player') {
                                
                                this.__graph.run(
                                    'addPlayerControls', 
                                    'player', 
                                    2, 
                                    'topdown', 
                                    ctx
                                );
                                //console.log(picked.pickedMesh);
                            } 
                            else if(!ctx.controls) {
                                this.__graph.run('addCameraControls', 0.5, ctx);
                            }
                                
                        });
        
                        setTimeout(() => { engine.setSize(canvas.clientWidth,canvas.clientHeight);  }, 100);
        
                        const light = new BABYLON.SpotLight(
                            'light1', 
                            new BABYLON.Vector3(0,90,0),
                            new BABYLON.Vector3(0,-1,0),
                            1,
                            2,
                            scene
                        );
                        light.shadowEnabled = true;
                        const shadowGenerator = new BABYLON.ShadowGenerator(1024,light);
                        shadowGenerator.usePercentageCloserFiltering = true;
                        ctx.shadowGenerator = shadowGenerator;
                        
                        ctx.shadowMap = shadowGenerator.getShadowMap();
        
                        let entityNames = [] as any;
        
                        if(ctx.entities) { //settings passed from main thread as PhysicsEntityProps[]
                            let meshes = ctx.entities.map((e,i) => {
                                let mesh = scene.getNodeById(this.__graph.run('addEntity', e, ctx, true)); 
                                entityNames[i] = e._id;
                                return mesh;
                            }) as BABYLON.Mesh[];
                            this.__graph.entities = meshes;
                        }
                        return entityNames;
                //       res(entityNames);
                //    });
                //});
                
            },
            draw:function (self:WorkerCanvas,canvas,context) {
                this.__graph.run('renderScene', self);
            },
            update:function (self:WorkerCanvas, canvas, context, 
                data:{[key:string]:{ 
                    position:{x:number,y:number,z:number}, 
                    rotation:{x:number,y:number,z:number,w:number} 
                }}|number[]
            ) {
                this.__graph.run('updateBabylonEntities', data);
            },
            clear:function (self:WorkerCanvas, canvas, context) {
                self.scene.dispose();
            }
        };

        Object.assign(options,BabylonCanvasProps);

        let renderId = this.__graph.run('setupCanvas', options); //the the base canvas tools do the rest, all ThreeJS tools are on self, for self contained ThreeJS renders
        //you can use the canvas render loop by default, or don't provide a draw function and just use the init and the Three animate() callback

        //let canvasopts = this.graph.CANVASES[renderId] as WorkerCanvas;

        return renderId;
    },
    renderScene:function (
        ctx?:string|WorkerCanvas
    ) {
        if(!(ctx as WorkerCanvas)?.scene)
            ctx = this.__graph.run('getCanvas', ctx);

        if(typeof ctx === 'object' && ctx.scene) {
            let timestep = performance.now();
            let frameTimeMs = timestep - ctx.lastTime || timestep;
            ctx.lastTime = timestep;
            if(ctx.animations) {
                for(const key in ctx.animations) {
                    ctx.animations[key](frameTimeMs, key); //simple support for keyframe tasks
                }
            }
            ctx.scene.render();
        }

    },
    initEngine:function ( //run this on the secondary thread
        ctx?:string|WorkerCanvas|{[key:string]:any}
    ){
        if(!ctx || typeof ctx === 'string')
            ctx = this.__graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') ctx = {};
        
        const canvas = ctx.canvas ? ctx.canvas : new OffscreenCanvas(100,100);
        const engine = new BABYLON.Engine(canvas);
        const scene = new BABYLON.Scene(engine);

        ctx.canvas = canvas;
        ctx.engine = engine;
        ctx.scene = scene;

        //duplicating for secondary engine threads (in our case for running a standalone navmesh/crowd animation thread) 
        if(!ctx._id) ctx._id = `canvas${Math.floor(Math.random()*1000000000000000)}`;

        if(!this.__graph.CANVASES) 
            this.__graph.CANVASES = {} as { [key:string]:WorkerCanvas };
        if(!this.__graph.CANVASES[ctx._id]) 
            this.__graph.CANVASES[ctx._id] = ctx;

        if(ctx.entities) {
            let names = ctx.entities.map((e,i) => {
                return this.__graph.run('addEntity', e, (ctx as any)._id, true);
            });

            return names;
        }

    },
    //can also use physics thread to sphere cast/get intersections
    rayCast: function (
        origin:BABYLON.Vector3, 
        direction:BABYLON.Vector3, 
        length?:number, 
        filter?:(mesh:BABYLON.AbstractMesh)=>boolean, 
        scene?:BABYLON.Scene, 
        ctx?:string|WorkerCanvas
    ) {
        //attach user to object and add controls for moving the object around
        if(!scene) {
            if(!ctx || typeof ctx === 'string')
                ctx = this.__graph.run('getCanvas',ctx);
    
            if(typeof ctx !== 'object') return undefined;

            scene = ctx.scene;

        }

        return scene?.pickWithRay(new BABYLON.Ray(origin,direction,length), filter);
    },
    onWin() { //report stats
        return true;
    }, //subscribe
    onDie() { //report stats
        return true;
    }, //subscribe
    onHPLoss(newHP) {//subscribe
        return newHP;
    }, 
    onKeyPickup(color) {//subscribe
        return color;
    }, 
    addPlayerControls:function(
        meshId:string,
        maxSpeed:number=0.5,
        cameraMode:'topdown'|'firstperson'|'thirdperson'='topdown',
        ctx?:string|WorkerCanvas
    ) {

        //TODO: VIRTUAL CURSOR

        //attach user to object and add controls for moving the object around
        if(!ctx || typeof ctx === 'string')
            ctx = this.__graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        if(ctx.controls) 
            this.__graph.run('removeControls', ctx.controls, ctx);

        const scene = ctx.scene as BABYLON.Scene;
        const canvas = ctx.canvas as HTMLCanvasElement;
        const physicsThread = (this.__graph as WorkerService).workers[ctx.physicsPort];

        if(!physicsThread) return undefined;

        let mesh = scene.getMeshById(meshId) as BABYLON.Mesh;
        if(!mesh) return undefined;

        let acceleration = new BABYLON.Vector3(0,0,0);

        let rotdefault = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(), 0); //let's align the mesh so it stands vertical
        
        let bb = mesh.getBoundingInfo().boundingBox;
        mesh.position.y = mesh.position.y - bb.vectors[0].z*0.5; //offset mesh position to account for new fixed z rotation

        let c = ctx as any;

        ctx.playerHP = 10;


        let dead = false;
        let win = false;

        ctx.animations["player"] = (frameTimeMs) => {

            if(c.maze) {
                let relPosX = c.maze.end.x - mesh.position.x;
                let relPosY = c.maze.end.y - mesh.position.z;
                if(!win && relPosX > 0.3 && relPosX < 0.7 && relPosY > 0.3 && relPosY < 0.7) {
                    //send win condition!
                    cleanupControls();
                    this.__graph.run('onWin');
                    win = true;
                }
            }

            if(c.keys) {
                for(const key in c.keys) {
                    let object = c.keys[key];
                    let dist = BABYLON.Vector3.Distance(mesh.position,object.position);
                    if(dist < 0.3) { //within 1 cell
                        //tell the physics thread we collected a key
                        this.__graph.run('removeEntity',key,c);
                        delete c.keys[key];

                        //play sound too
                        c.doors[key].forEach((door:BABYLON.Mesh) => {
                            this.__graph.run('removeEntity',door.id,c);
                        });

                        
                        this.__graph.run('onKeyPickup', key);
                    }
                }
            }

            if(!win && (mesh as PhysicsMesh).contacts) {
                if(((mesh as PhysicsMesh).contacts as string[]).find((v) => {
                    if(v.startsWith('blorb')) {
                        return true;
                    }
                })) {
                    c.playerHP -= ((mesh as PhysicsMesh).contacts as string[]).length*frameTimeMs/10000; //reduce hp by frame time and ncontacts so hp is roughly contact-quantity/time based
                    if(!dead && c.playerHP <= 0) {
                        cleanupControls(); //dead
                        this.__graph.run('onDie');
                        dead = true;
                    } else {
                        this.__graph.run('onHPLoss', c.playerHP);
                    }
                }
            } 
        }

        //terminal velocity, F = -kv; k = ma/vmax
        const mass = 100;
        const accel = 1;
        let linearDamping = mass * accel / maxSpeed;

        //attach the camera to the mesh
        const camera = ctx.camera as BABYLON.FreeCamera;
        camera.minZ = 0;
        physicsThread.run('updatePhysicsEntity', [
            meshId, { 
                position: { x:mesh.position.x, y:mesh.position.y, z:mesh.position.z },
                rotation:{ x:rotdefault.x, y:rotdefault.y, z:rotdefault.z, w:rotdefault.w},
                restitution:0.01,
                mass,
                //friction:0.2,
                linearDamping,
                angularDamping:10000 //prevent rotation by the physics engine (player-controlled instead)
            } as PhysicsEntityProps]
        );

        let cameraobs: BABYLON.Observer<BABYLON.Scene>;
        let topdownVector = new BABYLON.Vector3(0, 5, -0.1);
        if(camera) {
            
            if(cameraMode === 'topdown') {
                camera.position = mesh.position.add(topdownVector);
                camera.rotation.set(0,0,Math.PI);
                camera.setTarget(mesh.position);
            }
            else if(cameraMode === 'firstperson') {
                camera.position = mesh.position//.add(new BABYLON.Vector3(0, 1, 0));
                let rot = rotdefault.toEulerAngles();
                camera.rotation.set(rot.x,1,rot.z);
            }   
            else if (cameraMode === 'thirdperson') {
                camera.position = mesh.position.subtract(mesh.getDirection(BABYLON.Vector3.Forward()).scaleInPlace(0.2).subtract(mesh.getDirection(BABYLON.Vector3.Left()).scaleInPlace(1.5)));
                camera.position.y += 0.2;
                let rot = rotdefault.toEulerAngles();
                camera.rotation.set(rot.x,1,rot.z);
            }

            let obs = scene.onBeforeRenderObservable.add(() => {
                if(cameraMode === 'topdown') 
                    camera.position = mesh.position.add(topdownVector);
                else if (cameraMode === 'firstperson') 
                    camera.position = mesh.position//.add(new BABYLON.Vector3(0, 1, 0));
                else if(cameraMode === 'thirdperson') {
                    camera.position = mesh.position.subtract(mesh.getDirection(BABYLON.Vector3.Forward()).scaleInPlace(0.2).subtract(mesh.getDirection(BABYLON.Vector3.Left()).scaleInPlace(0.2)));
                    camera.position.y += 0.2;
                }
            });

            cameraobs = obs as BABYLON.Observer<BABYLON.Scene>;
         
        }

        // let lightsource = new BABYLON.SpotLight(
        //     'flashlight', 
        //     mesh.position.add(mesh.getDirection(BABYLON.Vector3.Forward()).scaleInPlace(0.3)), 
        //     mesh.getDirection(BABYLON.Vector3.Forward()), 
        //     Math.PI/4, 
        //     2, 
        //     scene
        // );
        // lightsource.parent = mesh;

        let swapCameras = () => {
            if(cameraMode === 'topdown')
                cameraMode = 'firstperson';
            else if (cameraMode === 'firstperson')
                cameraMode = 'thirdperson';
            else if (cameraMode === 'thirdperson') {
                cameraMode = 'topdown';
                camera.position = mesh.position.add(topdownVector);
                camera.rotation.set(0,0,Math.PI);
                camera.setTarget(mesh.position);
            }
        }

        let cleanupControls = () => {
            if(typeof ctx === 'object') {
                if(cameraobs) scene.onBeforeRenderObservable.remove(cameraobs);
                this.__graph.run('removeControls', ctx.controls, ctx);
                ctx.controls = this.__graph.run('addCameraControls', 0.5, ctx);
            }   
        }

        let multiKey = false;

        //various controls
        let forward = () => {
            let relDir = cameraMode === 'topdown' ? BABYLON.Vector3.Forward() : mesh.getDirection(BABYLON.Vector3.Forward());
            acceleration.normalize().addInPlace(relDir).normalize().scaleInPlace(accel * (multiKey ? 0.5 : 1));
            physicsThread.post('updatePhysicsEntity', [meshId, { acceleration:{ x:acceleration.x, z:acceleration.z} }])
        };
        let backward = () => {
            let relDir = cameraMode === 'topdown' ? BABYLON.Vector3.Backward() : mesh.getDirection(BABYLON.Vector3.Backward());
            acceleration.normalize().addInPlace(relDir).normalize().scaleInPlace(accel * (multiKey ? 0.5 : 1));
            physicsThread.post('updatePhysicsEntity', [meshId, { acceleration:{ x:acceleration.x, z:acceleration.z} }])
        };
        let left = () => {
            let relDir = cameraMode === 'topdown' ? BABYLON.Vector3.Left() : mesh.getDirection(BABYLON.Vector3.Left());
            acceleration.normalize().addInPlace(relDir).normalize().scaleInPlace(accel * (multiKey ? 0.5 : 1));
            physicsThread.post('updatePhysicsEntity', [meshId, { acceleration:{ x:acceleration.x, z:acceleration.z} }])
        };
        let right = () => {
            let relDir = cameraMode === 'topdown' ? BABYLON.Vector3.Right() : mesh.getDirection(BABYLON.Vector3.Right());
            acceleration.normalize().addInPlace(relDir).normalize().scaleInPlace(accel * (multiKey ? 0.5 : 1));
            physicsThread.post('updatePhysicsEntity', [meshId, { acceleration:{ x:acceleration.x, z:acceleration.z} }])
        };

        let jumped = false;
        let jump = () => {
            
            if(!jumped) {

                let pick = () => {
                    let direction = BABYLON.Vector3.Down();
                    let picked = scene.pickWithRay(new BABYLON.Ray(mesh.position, direction), (m) => { if(m.id === mesh.id) return false; else return true;});
                   
                    return picked;
                }

                let p = pick();
                if(p) {
                    let boundingBox = mesh.getBoundingInfo().boundingBox;
                    if(p.distance <= -boundingBox.vectors[0].y) {
                        let v = BABYLON.Vector3.Up();
                        jumped = true;
                        acceleration.addInPlace(v.scaleInPlace(maxSpeed*0.1));
                        physicsThread.post('updatePhysicsEntity', [meshId, { velocity:{ y:acceleration.y} }]);
                        
                        let jumping = () => {
                            let picked = pick();
                            if(picked) {
                                if(picked.distance <= -boundingBox.vectors[0].y) {
                                    jumped = false; //can jump again
                                    return;
                                }
                            }
                            requestAnimationFrame(jumping); //keep checking if we can jump again
                        }
                        jumping();
                    }
                }
            }
        };

        let oldMaxSpeed = maxSpeed;
        let run = () => { 
            maxSpeed = oldMaxSpeed*2;
            let linearDamping = mass * accel / maxSpeed;
            physicsThread.run('updatePhysicsEntity', [
                meshId, { 
                    linearDamping,
                   } as PhysicsEntityProps]
            );
         };
        let walk = () => { 
            maxSpeed = oldMaxSpeed*0.5;
            let linearDamping = mass * accel / maxSpeed;
            physicsThread.run('updatePhysicsEntity', [
                meshId, { 
                    linearDamping,
                   } as PhysicsEntityProps]
            );
            ; };
        let normalSpeed = () => { 
            maxSpeed = oldMaxSpeed;
            let linearDamping = mass * accel / maxSpeed;
            physicsThread.run('updatePhysicsEntity', [
                meshId, { 
                    linearDamping,
                   } as PhysicsEntityProps]
            );
         }

        //look at point of contact
        let topDownLook = (ev) => {
            // let pickResult = scene.pick(ev.clientX, ev.clientY); //expensive!!!

            // if(pickResult.pickedPoint) {
            //     var diffX = pickResult.pickedPoint.x - mesh.position.x;
            //     var diffY = pickResult.pickedPoint.z - mesh.position.z;
            //     let theta = Math.atan2(diffX,diffY);
            //     let rot = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(), theta);
            
            // Get canvas center
            let centerX = (ctx as WorkerCanvas).canvas.width / 2;
            let centerY = (ctx as WorkerCanvas).canvas.height / 2;

            // Calculate difference between event position and canvas center
            let diffX = ev.clientX - centerX;
            let diffY = ev.clientY - centerY;

            // Calculate angle from canvas center to event position
            let theta = Math.atan2(diffX, -diffY); // Y is inverted in screen coordinates
            let rot = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(), theta);
            
            physicsThread.post('updatePhysicsEntity', [meshId, { rotation:{ x:rot.x, y:rot.y, z:rot.z, w:rot.w} }])
            //}
        };
        //let firstPersonLook //look at camera controller

        let mode = 0; //0 shoot, 1 placement

        let sensitivity = 4;
        let fpsLook = (ev) => {
                let dMouseX = ev.movementX;
                let dMouseY = ev.movementY;

                camera.rotation.y += sensitivity*dMouseX/canvas.width; 
                camera.rotation.x += sensitivity*dMouseY/canvas.height;

                let direction = camera.getDirection(BABYLON.Vector3.Forward());
                direction.y = 1;
                let theta = Math.atan2(direction.x,direction.z);

                let rot = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(), theta);
                physicsThread.post('updatePhysicsEntity', [meshId, { rotation:{ x:rot.x, y:rot.y, z:rot.z, w:rot.w} }]);
        }


        let shoot = () => {
            let dirmesh = cameraMode === 'topdown' ? mesh : camera; //for topdown we will use click direction
            let forward = dirmesh.getDirection(BABYLON.Vector3.Forward()).scaleInPlace(0.14); //put the shot in front of the mesh
            let impulse = forward.scale(0.005) as any;
            impulse = {x:impulse.x,y:impulse.y,z:impulse.z};

            let settings = {
                _id:`shot${Math.floor(Math.random()*1000000000000000)}`,
                position:{x:mesh.position.x+forward.x,y:mesh.position.y + forward.y - 0.1,z:mesh.position.z + forward.z},
                collisionType:'ball',
                dynamic:true,
                radius:0.03,
                mass:10,
                impulse,
                ccd:true
            } as PhysicsEntityProps

            this.__graph.run('addEntity', settings);

            const bullet = scene.getMeshById(settings._id) as PhysicsMesh;

            let removed = false;
            const removeBullet = (contacting?:string) => {
                removed = true;
                //bullet.receiveShadows = false;
                const physicsWorker = (this.__graph as WorkerService).workers[(ctx as WorkerCanvas).physicsPort];
                let pulse = {x:impulse.x*1000,y:impulse.y*1000,z:impulse.z*1000};
                if(contacting) physicsWorker.post('updatePhysicsEntity', [contacting, { impulse:pulse }]);
                
                setTimeout(()=>{
                    this.__graph.run('removeEntity', settings._id);
                    scene.onBeforeRenderObservable.remove(bulletObsv);
                },300)
            }

            let bulletObsv = scene.onBeforeRenderObservable.add(() => {
                if(bullet.contacts && !removed) { //exists when last frame detected a contact
                    //console.log(bullet.contacts);
                    removeBullet(bullet.contacts[0]);
                }
            });

            setTimeout(() => { if(!removed) removeBullet(); }, 2000);
        };

        let aim = () => {}

        let placing = 'cube';
        let ghostPlaceableId;
        let ghostPlaceable: BABYLON.Mesh | undefined;
        let placed = {}; //record of placements
        let placeable = {
            cube: {
                collisionType:'cuboid',
                dimensions:{height:0.2, width:0.2, depth:0.2},
                mass:50,
                dynamic:true,
                position:{x:0, y:0.125, z:0},
                diffuseColor:{r:1,g:0,b:1}
            } as Partial<PhysicsEntityProps>,
            wall: {
                collisionType:'cuboid',
                dimensions:{height:0.5, width:0.5, depth:0.1},
                navMesh:true,
                position:{x:0, y:0.25, z:0},
                diffuseColor:{r:1,g:0,b:1}
            } as Partial<PhysicsEntityProps>,
            wall2: {
                collisionType:'cuboid',
                dimensions:{height:0.5, width:0.1, depth:0.5},
                navMesh:true,
                position:{x:0, y:0.25, z:0},
                diffuseColor:{r:1,g:0,b:1}
            } as Partial<PhysicsEntityProps>,
            // wall3: {
            //     collisionType:'cuboid',
            //     dimensions:{height:0.5, width:0.1, depth:0.5},
            //     navMesh:true,
            //     position:{x:0, y:0.25, z:0},
            //     diffuseColor:{r:1,g:0,b:1},
            // } as Partial<PhysicsEntityProps>,
            // platform: {
            //     collisionType:'cuboid',
            //     dimensions:{width:1,height:0.1,depth:1},
            //     navMesh:true,
            //     position:{x:0, y:5, z:0}
            // } as Partial<PhysicsEntityProps>,
        }

        let makePlaceable = (pick:BABYLON.PickingInfo) => {
            let settings = recursivelyAssign({},placeable[placing]);
            if(pick.pickedPoint) {
                settings.position.x += pick.pickedPoint.x;
                settings.position.y += pick.pickedPoint.y;
                settings.position.z += pick.pickedPoint.z;
            }
            settings._id = `placeable${Math.floor(Math.random()*1000000000000000)}`;
            settings.sensor = true;
            delete settings.dynamic;
            delete settings.navMesh;
            delete settings.crowd;
            delete settings.targetOf;

            this.__graph.run('addEntity', settings, ctx);
            ghostPlaceableId = settings._id;
            ghostPlaceable = scene.getMeshById(ghostPlaceableId) as BABYLON.Mesh;
            (ghostPlaceable.material as any).alpha = 0.5;

            hoverPlacement();
        }

        let removeGhostPlaceable = () => {
            if(ghostPlaceableId)
                this.__graph.run('removeEntity', ghostPlaceableId);

            ghostPlaceableId = undefined;
            ghostPlaceable = undefined;
        }

        let hoverPlacement = () => {
            let pick = scene.pick(scene.pointerX, scene.pointerY, (mesh) => { 
                if(ghostPlaceable && mesh.id === ghostPlaceableId) return false;
                else return true;  
            });

            if(pick.pickedMesh?.id && placed[pick.pickedMesh.id]) { //if hovering over a user placement
                removeGhostPlaceable();
                //should add a glow to the picked mesh to indicate it is selected
            }
            else if(pick.pickedPoint) {
                if(!ghostPlaceableId) makePlaceable(pick);
                const physicsWorker = (this.__graph as WorkerService).workers[(ctx as WorkerCanvas).physicsPort];
                if(ghostPlaceable) {
                    let position = {
                        x:pick.pickedPoint.x + placeable[placing].position.x,
                        y:pick.pickedPoint.y + placeable[placing].position.y,
                        z:pick.pickedPoint.z + placeable[placing].position.z
                    } 
                    physicsWorker.post('updatePhysicsEntity', [
                        ghostPlaceableId, { 
                            position 
                        }
                    ]);

                    ghostPlaceable.position.set(position.x,position.y,position.z); //update manually as it is considered unmoving on the physics thread
                }
            }
        }

        let place = () => {
            let pick = scene.pick(scene.pointerX, scene.pointerY, (mesh) => { 
                if(ghostPlaceable && mesh.id === ghostPlaceableId) return false;
                else return true;  
            });
            if(pick.pickedPoint) {
                let settings = recursivelyAssign({}, placeable[placing]);
                if(pick.pickedMesh?.id && placed[pick.pickedMesh.id]) { //remove existing mesh
                    this.__graph.run('removeEntity', pick.pickedMesh.id);
                    delete placed[pick.pickedMesh.id];
                }
                else if(pick.pickedPoint && ghostPlaceable) { //place new mesh
                    settings.position.x += pick.pickedPoint.x;
                    settings.position.y += pick.pickedPoint.y;
                    settings.position.z += pick.pickedPoint.z;
                    settings._id = `placeable${Math.floor(Math.random()*1000000000000000)}`;
                    this.__graph.run('addEntity', settings, ctx);
                    placed[settings._id] = scene.getMeshById(settings._id) as BABYLON.Mesh;
                    removeGhostPlaceable();
                }
            }
        }

        // let sphereCast = () => {
        //     if((ctx as WorkerCanvas).physicsPort) {
        //         const physicsWorker = this.__graph.workers[(ctx as WorkerCanvas).physicsPort];
                
        //         physicsWorker.run('sphereCast', [mesh.position, ])
        //     }
        // }; //activate crowd members in proximity when crossing a ray or sphere cast (i.e. vision)

        let ctrlobserver, spaceobserver, shiftobserver;

        let moveObservers = {} as any;

        //implement above controls with these event listeners
        // TODO: Generalizer this to a keymapping object and just set the functions for the corresponding keys e.g. to allow quick remapping
        let keydownListener = (ev) => {
            let pass;
            if(ev.keyCode === 87 || ev.keycode === 38) { //w or arrow up
                if(!moveObservers.wobserver) moveObservers.wobserver = scene.onBeforeRenderObservable.add(forward);
                pass = true; if(Object.keys(moveObservers).length > 1) multiKey = true;
            }
            if(ev.keyCode === 65 || ev.keycode === 37) { //a or arrow left
                if(!moveObservers.aobserver) moveObservers.aobserver = scene.onBeforeRenderObservable.add(left);
                pass = true; if(Object.keys(moveObservers).length > 1) multiKey = true;
            }
            if(ev.keyCode === 83 || ev.keycode === 40) { //s or arrow down
                if(!moveObservers.sobserver) moveObservers.sobserver = scene.onBeforeRenderObservable.add(backward);
                pass = true; if(Object.keys(moveObservers).length > 1) multiKey = true;
            }
            if(ev.keyCode === 68 || ev.keycode === 39) { //d or arrow right
                if(!moveObservers.dobserver) moveObservers.dobserver = scene.onBeforeRenderObservable.add(right);
                pass = true; if(Object.keys(moveObservers).length > 1) multiKey = true;
            }
            if(ev.keyCode === 16) { //shift key
                if(!shiftobserver) shiftobserver = scene.onBeforeRenderObservable.add(run);
                pass = true;
            }
            if(ev.keyCode === 17) { //ctrl key
                if(!ctrlobserver) ctrlobserver = scene.onBeforeRenderObservable.add(walk);
                pass = true;
            }
            if(ev.keyCode === 32) { //space key
                if(!spaceobserver) spaceobserver = scene.onBeforeRenderObservable.add(jump);
                pass = true;
            }

            if(ev.keyCode === 9) { //tab
                pass = true;
            }

            if(ev.keyCode === 18) { //alt
                mode = 1;
                pass = true;
                //placement mode
            }

            if(ev.keyCode === 81) { //q
                pass = true;
            }

            if(ev.keyCode === 69) { //e
                pass = true;
            }

            if(ev.keyCode === 70) { //f
                pass = true;
            }

            if(ev.keyCode === 82) { //r
                pass = true;
            }

            if(ev.keyCode === 86) { //v
                pass = true;
            }

            if(ev.keyCode === 67) { //c
                pass = true;
            }

            if(ev.keyCode === 90) { //z 
                pass = true;
            }

            if(ev.keyCode === 88) { //x
                pass = true;
            }

            if(ev.keyCode === 8) { //esc
                pass = true;
            }

            if(ev.keyCode === 27) { //backspace
                pass = true;
            }

            if(pass) {
                if(ev.preventDefault) ev.preventDefault();
            }
        };
        
        let keyupListener = (ev) => {
            let pass;

            //w or arrow up
            if(ev.keyCode === 87 || ev.keycode === 38) {
                if(moveObservers.wobserver) {
                    scene.onBeforeRenderObservable.remove(moveObservers.wobserver);
                    delete moveObservers.wobserver; if(Object.keys(moveObservers).length < 2) multiKey = false;
                }
                pass = true;
            }
            //a or arrow left
            if(ev.keyCode === 65 || ev.keycode === 37) {
                if(moveObservers.aobserver) {
                    scene.onBeforeRenderObservable.remove(moveObservers.aobserver);
                    delete moveObservers.aobserver; if(Object.keys(moveObservers).length < 2) multiKey = false;
                }
                pass = true;
            }
            //s or arrow down
            if(ev.keyCode === 83 || ev.keycode === 40) {
                if(moveObservers.sobserver) {
                    scene.onBeforeRenderObservable.remove(moveObservers.sobserver);
                    delete moveObservers.sobserver; if(Object.keys(moveObservers).length < 2) multiKey = false;
                }
                pass = true;
            }
            //d or arrow right
            if(ev.keyCode === 68 || ev.keycode === 39) {
                if(moveObservers.dobserver) {
                    scene.onBeforeRenderObservable.remove(moveObservers.dobserver);
                    delete moveObservers.dobserver; if(Object.keys(moveObservers).length < 2) multiKey = false;
                }
                pass = true;
            }
            if(ev.keyCode === 16) {
                if(shiftobserver) {
                    scene.onBeforeRenderObservable.remove(shiftobserver);
                    normalSpeed();
                    shiftobserver = null;
                }
                pass = true;
            }
            if(ev.keyCode === 17) {
                if(ctrlobserver) {
                    scene.onBeforeRenderObservable.remove(ctrlobserver);
                    normalSpeed();
                    ctrlobserver = null;
                }
                pass = true;
            }
            if(ev.keyCode === 32) {
                if(spaceobserver) {
                    scene.onBeforeRenderObservable.remove(spaceobserver);
                    spaceobserver = null;
                }
                pass = true;
            }

            if(ev.keyCode === 81) { //q
                pass = true;

            }

            if(ev.keyCode === 69) { //e
                pass = true;

            }

            if(ev.keyCode === 70) { //f
                pass = true;

            }

            if(ev.keyCode === 82) { //r
                pass = true;
            }

            if(ev.keyCode === 86) { //v
                pass = true;
            }

            if(ev.keyCode === 67) { //c
                pass = true;

            }

            if(ev.keyCode === 90) { //z 
                pass = true;
                swapCameras();
            }

            if(ev.keyCode === 88) { //x
                pass = true;
            }

            if(ev.keyCode === 8) {//backspace
                pass = true;
                cleanupControls();
            }

            if(ev.keyCode === 9) { //tab
                pass = true;

            }
            if(ev.keyCode === 16) { //shift
                pass = true;
            }

            if(ev.keyCode === 18) { //alt
                mode = 0; //placement mode
                removeGhostPlaceable();
                pass = true;
            }

            if(ev.keyCode === 8) { //esc
                pass = true;
            }

            if(pass) {
                if(ev.preventDefault) ev.preventDefault();
            }
        };


        let mouseupListener = (ev:MouseEvent) => {
            if(ev.preventDefault) ev.preventDefault();
        };
        let mousedownListener = (ev:MouseEvent) => {
            if(mode === 0) shoot();
            if (mode === 1) place(); 

            if(ev.preventDefault) ev.preventDefault();
        };
        let mousemoveListener = (ev) => {
            if(cameraMode === 'topdown') topDownLook(ev);
            else fpsLook(ev);

            if(mode === 1) {
                hoverPlacement();
            }
        };

        let mousewheelListener = (ev:WheelEvent) => {
            if(mode === 1) {
                if(ev.deltaY) { //scroll the list of placeables 
                    let keys = Object.keys(placeable);
                    let curIdx = keys.indexOf(placing);
                    if(ev.deltaY > 0) {
                        curIdx++;
                        if(curIdx >= keys.length) curIdx = 0;
                        removeGhostPlaceable();
                        placing = keys[curIdx];
                        hoverPlacement();
                    }
                    if(ev.deltaY < 0) {
                        curIdx--;
                        if(curIdx < 0 ) curIdx = keys.length-1;
                        removeGhostPlaceable();
                        placing = keys[curIdx];
                        hoverPlacement();
                    }
                }
            }
        }

        canvas.addEventListener('keydown', keydownListener);
        canvas.addEventListener('keyup', keyupListener);
        canvas.addEventListener('mousedown', mousedownListener);
        canvas.addEventListener('mouseup', mouseupListener);
        canvas.addEventListener('mousemove', mousemoveListener);
        canvas.addEventListener('wheel', mousewheelListener);

        let __ondisconnected = () => {
            if(cameraobs) scene.onBeforeRenderObservable.remove(cameraobs);

            //reset entity properties, could e.g. trigger ragdoll mode 
            physicsThread.post('updatePhysicsEntity', [
                meshId, { 
                    restitution:0.5,
                    //friction:0,
                    angularDamping:0 
                } as PhysicsEntityProps]
            );
        }

        ctx.controls = {
            mode:'player',
            keydownListener,
            keyupListener,
            mousedownListener,
            mouseupListener,
            mousemoveListener,
            mousewheelListener,
            __ondisconnected
        };

        return ctx.controls; //controls you can pop off the canvas


        // restrict entity updates entirely to the controller
        // if(physicsPort) {
        //     (this.__graph.workers[physicsPort] as WorkerInfo).post('updatePhysicsEntity', [meshId, {dynamic:false}]); //set it as a static mesh
        // }

    },
    removeControls:function(
        controls?:any, 
        ctx?:string|WorkerCanvas
    ) {
        if(!ctx || typeof ctx === 'string')
        ctx = this.__graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        if(!controls)
            controls = ctx.controls as any;

        if(!controls) return undefined;

        const canvas = ctx.canvas as OffscreenCanvas|HTMLCanvasElement;

        if(controls.keydownListener) canvas.removeEventListener('keydown', controls.keydownListener);
        if(controls.keyupListener) canvas.removeEventListener('keyup', controls.keyupListener);
        if(controls.mouseupListener) canvas.removeEventListener('mouseup', controls.mouseupListener);
        if(controls.mousedownListener) canvas.removeEventListener('mousedown', controls.mousedownListener);
        if(controls.mousemoveListener) canvas.removeEventListener('mousemove', controls.mousemoveListener);
        if(controls.mousewheelListener) canvas.removeEventListener('wheel', controls.mousewheelListener);
        
        //remove any active controls observers (wasd, ctrl, space, shift)

        requestAnimationFrame(() => { //for whatever reason the controls don't remove right away so this makes sure we don't overlap events on accident
            if(controls.keyupListener){
                controls.keyupListener({keyCode:87});
                controls.keyupListener({keyCode:65});
                controls.keyupListener({keyCode:83});
                controls.keyupListener({keyCode:68});
                controls.keyupListener({keyCode:16});
                controls.keyupListener({keyCode:17});
                controls.keyupListener({keyCode:32});
            }
    
            if(controls.mouseupListener) controls.mouseupListener({});
    
            if(controls.__ondisconnected) controls.__ondisconnected();
    
        })
        
        ctx.controls = null;

    },
    attachFreeCamera:function (
        ctx?:string|WorkerCanvas
    ) {

        if(!ctx || typeof ctx === 'string')
            ctx = this.__graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        const scene = ctx.scene as BABYLON.Scene;

        const camera = new BABYLON.FreeCamera(
            'camera', 
            new BABYLON.Vector3(-20,10,0), 
            scene
        );

        //camera.attachControl(canvas, false);

        camera.setTarget(new BABYLON.Vector3(0,0,0));

        return camera;
    },
    addCameraControls:function(
        speed=0.5,
        ctx?:string|WorkerCanvas
    ) {
        if(!ctx || typeof ctx === 'string')
            ctx = this.__graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        const scene = ctx.scene as BABYLON.Scene;
        const canvas = ctx.canvas as OffscreenCanvas|HTMLCanvasElement;
        const camera = ctx.camera as BABYLON.FreeCamera;

        camera.speed = speed;

        if(!camera) return undefined;

        let w = () => {
            const move = camera.getDirection(BABYLON.Vector3.Forward()).scaleInPlace(camera.speed);
            camera.position.addInPlace(move);
        }
        let a = () => {
            camera.position.addInPlace(camera.getDirection(BABYLON.Vector3.Left()).scaleInPlace(camera.speed));
        }
        let s = () => {
            camera.position.addInPlace(camera.getDirection(BABYLON.Vector3.Backward()).scaleInPlace(camera.speed));
        }
        let d = () => {
            camera.position.addInPlace(camera.getDirection(BABYLON.Vector3.Right()).scaleInPlace(camera.speed));
        }
        let ctrl = () => {
            camera.position.addInPlace(BABYLON.Vector3.Down().scaleInPlace(camera.speed));
        }
        let space = () => {
            camera.position.addInPlace(BABYLON.Vector3.Up().scaleInPlace(camera.speed));
        }

        let wobserver, aobserver, sobserver, dobserver, ctrlobserver, spaceobserver;
        //need to set custom controls
        
        let keydownListener = (ev:any) => { //these key events are proxied from main thread

            let pass;
            if(ev.keyCode === 87 || ev.keycode === 38) {
                if(!wobserver) wobserver = scene.onBeforeRenderObservable.add(w);
                pass = true;
            }
            if(ev.keyCode === 65 || ev.keycode === 37) {
                if(!aobserver) aobserver = scene.onBeforeRenderObservable.add(a);
                pass = true;
            }
            if(ev.keyCode === 83 || ev.keycode === 40) {
                if(!sobserver) sobserver = scene.onBeforeRenderObservable.add(s);
                pass = true;
            }
            if(ev.keyCode === 68 || ev.keycode === 39) {
                if(!dobserver) dobserver = scene.onBeforeRenderObservable.add(d);
                pass = true;
            }
            if(ev.keyCode === 17) {
                if(!ctrlobserver) ctrlobserver = scene.onBeforeRenderObservable.add(ctrl);
                pass = true;
            }
            if(ev.keyCode === 32) {
                if(!spaceobserver) spaceobserver = scene.onBeforeRenderObservable.add(space);
                pass = true;
            }
            //console.log(ev);
            if(pass) ev.preventDefault();
        }
        
        canvas.addEventListener('keydown', keydownListener);
       
        let keyupListener = (ev:any) => {
            
            if(ev.keyCode === 87 || ev.keycode === 38) {
                if(wobserver) {
                    scene.onBeforeRenderObservable.remove(wobserver);
                    wobserver = null;
                }
            }
            if(ev.keyCode === 65 || ev.keycode === 37) {
                if(aobserver) {
                    scene.onBeforeRenderObservable.remove(aobserver);
                    aobserver = null;
                }
            }
            if(ev.keyCode === 83 || ev.keycode === 40) {
                if(sobserver) {
                    scene.onBeforeRenderObservable.remove(sobserver);
                    sobserver = null;
                }
            }
            if(ev.keyCode === 68 || ev.keycode === 39) {
                if(dobserver) {
                    scene.onBeforeRenderObservable.remove(dobserver);
                    dobserver = null;
                }
            }
            if(ev.keyCode === 17) {
                if(ctrlobserver) {
                    scene.onBeforeRenderObservable.remove(ctrlobserver);
                    ctrlobserver = null;
                }
            }
            if(ev.keyCode === 32) {
                if(spaceobserver) {
                    scene.onBeforeRenderObservable.remove(spaceobserver);
                    spaceobserver = null;
                }
            }
            //console.log(ev);
        }

        canvas.addEventListener('keyup', keyupListener);
        
        let lastMouseMove;

        let mousemoveListener = (ev:any) => {
            if(lastMouseMove) {
                let dMouseX = ev.clientX - lastMouseMove.clientX;
                let dMouseY = ev.clientY - lastMouseMove.clientY;

                camera.rotation.y += 4*dMouseX/canvas.width; 
                camera.rotation.x += 4*dMouseY/canvas.height;
            }
            lastMouseMove = ev;
        }

        const mousedownListener = (ev:any) => {
            canvas.addEventListener('mousemove',mousemoveListener);
            //console.log(ev);
        }

        const mouseupListener = (ev:any) => {
            canvas.removeEventListener('mousemove',mousemoveListener);
            lastMouseMove = null;
            //console.log(ev);
        }

        canvas.addEventListener('mousedown', mousedownListener);
        canvas.addEventListener('mouseup', mouseupListener);

        const controls = {
            mode:'freecam',
            keydownListener,
            keyupListener,
            mousedownListener,
            mouseupListener,
            mousemoveListener
        };

        ctx.controls = controls; 
        return controls; //controls you can pop off the canvas

    },


    addEntity:function (
        settings:PhysicsEntityProps,
        ctx?:string|WorkerCanvas,
        onInit?:boolean
    ) {
        if(!ctx || typeof ctx === 'string')
            ctx = this.__graph.run('getCanvas',ctx);
    
        if(typeof ctx !== 'object') return undefined;
    
        if(settings._id && this.__graph.get(settings._id)) return settings._id; //already established
    
        const scene = ctx.scene as BABYLON.Scene;
        let entity: PhysicsMesh | undefined; // Assuming PhysicsMesh is a type alias for BABYLON.Mesh
    
        
        if(!this.__graph.entities) this.__graph.entities = {};

        if(settings.navMesh && settings.instance) 
            settings.instance = false; //TEMP,  FIX NAVMESH CALL TO USE THE PARENT INSTANCE FOR INSTANCES
        //limited settings rn for simplicity to work with the physics engine
        if(settings.instance) {
            // right now instances break navmeshes because we need to pass the parent only
            let template = scene.getMeshById(settings.collisionType+'TEMPLATE') as BABYLON.Mesh;
            if (!template) {
                // Creation logic for each template type
                switch (settings.collisionType) {
                    case 'ball':
                        template = BABYLON.MeshBuilder.CreateSphere(settings.collisionType+'TEMPLATE', { diameter: 2, segments: 8 }, scene);
                        const sphereMat = new BABYLON.StandardMaterial('spheremat', scene);
                        template.material = sphereMat;
                        sphereMat.diffuseColor = new BABYLON.Color3(1,1,0);
                        break;
                    case 'capsule':
                        template = BABYLON.MeshBuilder.CreateCapsule(settings.collisionType+'TEMPLATE', {
                            radius: 1,
                            height: 4,
                            tessellation: 12,
                            capSubdivisions: 12
                        }, scene);
                        const capsuleMat = new BABYLON.StandardMaterial('capsulemat', scene);
                        template.material = capsuleMat;
                        break;
                    case 'cuboid':
                        template = BABYLON.MeshBuilder.CreateBox(settings.collisionType+'TEMPLATE', { width: 1, height: 1, depth: 1 }, scene);
                        const boxMat = new BABYLON.StandardMaterial('boxmat', scene);
                        template.material = boxMat;
                        break;
                    case 'cylinder':
                        template = BABYLON.MeshBuilder.CreateCylinder(settings.collisionType+'TEMPLATE', { height: 2, diameter: 2, tessellation: 12 }, scene);
                        
                        const cylmat = new BABYLON.StandardMaterial('cylmat', scene);
                        template.material = cylmat;
                        break;
                    case 'cone':
                        template = BABYLON.MeshBuilder.CreateCylinder(settings.collisionType+'TEMPLATE', { height: 2, diameterTop: 0, diameterBottom: 2, tessellation: 12 }, scene);
                        
                        const conemat = new BABYLON.StandardMaterial('conemat', scene);
                        template.material = conemat;
                        break;
                }
                template.isVisible = false;
                template.isPickable = false;
                template.receiveShadows = true;
            }
        
            if (!settings._id) settings._id = `${settings.collisionType}${Math.floor(Math.random() * 1000000000000000)}`;
            
            entity = template.createInstance(settings._id) as PhysicsMesh;

            // Apply settings to the instance
            if (settings.position) {
                entity.position = new BABYLON.Vector3(settings.position.x, settings.position.y, settings.position.z);
            }
        
            if(settings.rotation) {
                entity.rotationQuaternion = new BABYLON.Quaternion(
                    settings.rotation.x, 
                    settings.rotation.y,
                    settings.rotation.z,
                    settings.rotation.w
                );
            } else entity.rotationQuaternion = new BABYLON.Quaternion();

            // Apply original dimensions, radius, or halfHeight settings with proper scaling
            switch (settings.collisionType) {
                case 'ball':
                    if(!settings.radius) settings.radius = 1;
                    let radius = settings.radius ? settings.radius : settings.collisionTypeParams ? settings.collisionTypeParams[0] : 1;
                    entity.scaling = new BABYLON.Vector3(radius,radius,radius);
                    break;
                case 'capsule':
                    let heightScale = settings.halfHeight ? settings.halfHeight : settings.collisionTypeParams ? settings.collisionTypeParams[1] : 2;
                    entity.scaling = new BABYLON.Vector3( settings.radius, settings.radius, heightScale); // Adjust capsule scaling appropriately //FIX
                    break;
                case 'cuboid':
                    let dimensions = settings.dimensions ? settings.dimensions : settings.collisionTypeParams ? {
                        width:settings.collisionTypeParams[0],
                        height:settings.collisionTypeParams[1],
                        depth:settings.collisionTypeParams[2]
                    } : {width:1,height:1,depth:1}
                    entity.scaling = new BABYLON.Vector3(
                        dimensions.width,
                        dimensions.height,
                        dimensions.depth
                    );
                    break;
                case 'cylinder':
                case 'cone':
                    if(!settings.radius) settings.radius = 1;
                    let radius2 = settings.radius ? settings.radius : settings.collisionTypeParams ? settings.collisionTypeParams[0] : 1;
                    entity.scaling = new BABYLON.Vector3(radius2,radius2,radius2);
                    break;
            }
        } else if(settings.collisionType === 'ball') {
            if(!settings._id) settings._id = `ball${Math.floor(Math.random()*1000000000000000)}`
            
            entity = BABYLON.MeshBuilder.CreateSphere(
                settings._id,
                { 
                    diameter:settings.radius ? settings.radius*2 : settings.collisionTypeParams ? settings.collisionTypeParams[0]*2 : 1, 
                    segments: 8 
                }, 
                scene
            );

        } else if (settings.collisionType === 'capsule') {
            if(!settings._id) settings._id = `capsule${Math.floor(Math.random()*1000000000000000)}`;

            entity = BABYLON.MeshBuilder.CreateCapsule(
                settings._id,
                { 
                    radius:settings.radius ? settings.radius*1 : settings.collisionTypeParams ? settings.collisionTypeParams[0]*1*1 : 1, 
                    height:settings.halfHeight ? settings.halfHeight*2*2 : settings.collisionTypeParams ? settings.collisionTypeParams[1]*2*2 : 2,
                    tessellation:12,
                    capSubdivisions:12,
                    
                },
                scene
            );

        } else if (settings.collisionType === 'cuboid') {
            if(!settings._id) settings._id = `box${Math.floor(Math.random()*1000000000000000)}`;
            
            entity = BABYLON.MeshBuilder.CreateBox(
                settings._id,
                settings.dimensions ? settings.dimensions : settings.collisionTypeParams ? {
                    width:settings.collisionTypeParams[0],
                    height:settings.collisionTypeParams[1],
                    depth:settings.collisionTypeParams[2]
                } : {width:1,height:1,depth:1},
                scene
            );

        } else if(settings.collisionType === 'cylinder') {
            if(!settings._id) settings._id = `cylinder${Math.floor(Math.random()*1000000000000000)}`;

            entity = BABYLON.MeshBuilder.CreateCylinder(settings._id, { 
                height: settings.dimensions?.height ? settings.dimensions.height : 1, 
                diameter: settings.radius ? settings.radius*2 : 1,
                tessellation: 12
            });

        } else if (settings.collisionType === 'cone') {
            if(!settings._id) settings._id = `cone${Math.floor(Math.random()*1000000000000000)}`;

            entity = BABYLON.MeshBuilder.CreateCylinder(settings._id, { 
                height: settings.dimensions?.height ? settings.dimensions.height : 1, 
                diameter: settings.radius ? settings.radius*2 : 1,
                tessellation: 12,
                diameterTop:0
            });

        } 

        if(entity) {

            if(!settings.instance) {
                entity.receiveShadows = true; 

                let mat = new BABYLON.StandardMaterial('entitymat'+settings._id, scene)
                if(settings.diffuseColor || settings.specularColor) {
                    entity.material = mat;
                    if(settings.diffuseColor) {
                        mat.diffuseColor = new BABYLON.Color3(settings.diffuseColor.r,settings.diffuseColor.g,settings.diffuseColor.b);
                    }
                    if(settings.specularColor) {
                        mat.specularColor = new BABYLON.Color3(settings.specularColor.r,settings.specularColor.g,settings.specularColor.b);
                    }
                    if(settings.alpha) {
                        mat.alpha = settings.alpha;
                    }
                }
            }

            if(settings.animation) {
                ctx.animations[settings._id] = settings.animation;
            }

            entity.dynamic = settings.dynamic;
            entity.crowd = settings.crowd;
            entity.navMesh = settings.navMesh;
            entity.collisionType = settings.collisionType;
            entity.field = settings.field;

            this.__graph.entities[settings._id] = entity;

            if(settings.position) {
                entity.position.x = settings.position.x;
                entity.position.y = settings.position.y;
                entity.position.z = settings.position.z;
            }

            if(settings.rotation) {
                entity.rotationQuaternion = new BABYLON.Quaternion(
                    settings.rotation.x, 
                    settings.rotation.y,
                    settings.rotation.z,
                    settings.rotation.w
                );
            } else entity.rotationQuaternion = new BABYLON.Quaternion();
        

            if(ctx.shadowGenerator) {
                (ctx.shadowGenerator as BABYLON.ShadowGenerator).addShadowCaster(entity);
            }
        
            let node = (this.__graph as WorkerService).add(
                {
                    __node:{ tag:settings._id },
                    __ondisconnected:function (node) {
                        if((ctx as WorkerCanvas).entities[(entity as PhysicsMesh).id]) this.__graph.run('removeEntity', settings._id, ctx);
                    }
                }
            );

            node.__proxyObject(entity);
            
            if(!ctx.entities) ctx.entities = {};
            ctx.entities[entity.id] = settings;

            //todo: check for redundancy
            if(ctx.physicsPort) {
                const physicsWorker = this.__graph.workers[ctx.physicsPort];
                (physicsWorker as WorkerInfo).post('addPhysicsEntity', [settings]);
            }
            if(!onInit) {
                if(ctx.navPort) {
                    const navWorker = this.__graph.workers[ctx.navPort];
                    (navWorker as WorkerInfo).post('addEntity', [settings]); //duplicate entities for the crowd navigation thread e.g. to add agents, obstacles, etc.
                    if(settings.crowd) {
                        (navWorker as WorkerInfo).post('addCrowdAgent', [settings._id, settings.crowd, undefined, ctx._id]);
                    }
                    if(settings.targetOf) {
                        (navWorker as WorkerInfo).post('setCrowdTarget', [settings._id, settings.targetOf, ctx._id]);
                    }
                    if(settings.navMesh) {
                        (navWorker as WorkerInfo).post('addToNavMesh', [[settings._id], ctx._id]);
                    }
                }
            }
        }

        return settings._id;
    },
    createThinInstances(
        nInstances,
        settings,
        ctx?:WorkerCanvas|string
    ) {

        if(!ctx || typeof ctx === 'string')
            ctx = this.__graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return;

        if(!this.__graph.instances) this.__graph.instances = {};

    },
    createSolidParticleSystem(
        nParticles:number,
        settings:PhysicsEntityProps,
        positionsAndRotations:Float32Array, //x,y,z,rx,ry,rz,rw
        pSettings:any[],
        ctx?:WorkerCanvas|string
    ) {

        if(!ctx || typeof ctx === 'string')
            ctx = this.__graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return;

        if(!this.__graph.particleSystems) {
            this.__graph.particleSystems = {};
            this.__graph.particles = {};
        }

        const _id = settings._id || 'particles'+Object.keys(this.__graph.particleSystems).length;

        const scene = ctx.scene as BABYLON.Scene;
        //todo tetras and cubes

        //temp
        let shape = BABYLON.MeshBuilder.CreateSphere(
            "ptemplate",{
                segments:8,
                diameter:(settings.radius ? settings.radius*2 : 2)
            }, scene); 

        let pSystem = new BABYLON.SolidParticleSystem(
            'particles'+Object.keys(this.__graph.particleSystems).length,
            ctx.scene,
            {
                updatable:true,
                isPickable:false,
                enableDepthSort:true
                //enableMultiMaterial:true
            }
        );


        pSystem.addShape(shape, nParticles);

        //temp
        shape.dispose();

        let physics;
        if(ctx.physicsPort)
            physics = (this.__graph.workers[ctx.physicsPort] as WorkerInfo)

        pSystem.initParticles = () => {
            const offset = 7;
            for(let i = 0; i < pSystem.nbParticles; i++) {
                const j = i*offset;
                const pid = `${_id}_${i}`
                pSystem.particles[i].position.set(
                    positionsAndRotations[0],
                    positionsAndRotations[1],
                    positionsAndRotations[2]
                );
                pSystem.particles[i].rotationQuaternion = new BABYLON.Quaternion(
                    positionsAndRotations[j+3],
                    positionsAndRotations[j+4],
                    positionsAndRotations[j+5],
                    positionsAndRotations[j+6]
                )
                this.__graph.entities[pid] = pSystem.particles[i]; //store this on graph
                this.__graph.particles[pid] = pSystem.particles[i]; //specific reference for solid particle instances
            
                if(physics && settings.collisionType) {
                    settings._id = pid;
                    settings.position = {
                        x:positionsAndRotations[0],
                        y:positionsAndRotations[1],
                        z:positionsAndRotations[2]
                    };
                    settings.rotation = {
                        x:positionsAndRotations[j+3],
                        y:positionsAndRotations[j+4],
                        z:positionsAndRotations[j+5],
                        w:positionsAndRotations[j+6]
                    };
                    physics.post('addPhysicsEntity',[settings]);
                }
            }
        }

        // pSystem.updateParticle = (particle) => {
        //     return particle;
        // }

        pSystem.initParticles();
        pSystem.setParticles();

        // pSystem.refreshVisibleSize()
        // pSystem.isAlwaysVisible = true; 

        this.__graph.particleSystems[_id] = pSystem;

        return _id;

    },
    updateBabylonEntities:function(
        data:{
            buffer:{
                [id:string]:{ 
                    position:{x:number,y:number,z:number}, 
                    rotation:{x:number,y:number,z:number,w:number},
                }
            },
            contacts?:{
                [id:string]:string[]
            } //ids of meshes this body is in contact with
        }|{
            buffer:number[],
            _ids:string[],
            contacts?:{
                [id:string]:string[]
            } //ids of meshes this body is in contact with
        },
        ctx?:WorkerCanvas|string 
    ) {

        if(!ctx || typeof ctx === 'string')
            ctx = this.__graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        const scene = ctx.scene as BABYLON.Scene;

    
        if((data as any)._ids && data.buffer) { //array buffer
            const offset = 7;

            const entities = this.__graph.entities;

            for(let i = 0; i < (data as any)._ids.length; i++) {
                const _id = (data as any)._ids[i]; 
                let j = i*offset;
                
                let mesh = entities[_id] || scene.getNodeByName(_id as string) as PhysicsMesh//scene.getMeshByName(e._id as string) as PhysicsMesh;
            
                if(!mesh) continue;

                if(data.contacts?.[_id]) {
                    mesh.contacts = data.contacts[_id];
                } else if(mesh.contacts) delete mesh.contacts; //delete old contacts on this frame
            
                mesh.position.set(
                    data.buffer[j],
                    data.buffer[j+1],
                    data.buffer[j+2]
                );

                if(mesh.rotationQuaternion) {
                    mesh.rotationQuaternion.set(
                        data.buffer[j+3],
                        data.buffer[j+4],
                        data.buffer[j+5],
                        data.buffer[j+6]
                    ); 
                }

            }

       
        }
        else if(typeof data === 'object') { //key-value pairs
            for(const key in data.buffer) {
                //if(idx === 0) { idx++; continue; }
                let mesh = this.__graph.entities[key] || scene.getNodeByName(key) as PhysicsMesh;//scene.getMeshByName(key) as PhysicsMesh;
                //console.log(JSON.stringify(mesh?.rotation),JSON.stringify(data[key].rotation))
                if(mesh) {
                    if(data.buffer[key].position) {
                        mesh.position.set(
                            data.buffer[key].position.x,
                            data.buffer[key].position.y,
                            data.buffer[key].position.z
                        );
                    }
                    if(data.buffer[key].rotation && mesh.rotationQuaternion) {
                        mesh.rotationQuaternion.set(
                            data.buffer[key].rotation.x,
                            data.buffer[key].rotation.y,
                            data.buffer[key].rotation.z,
                            data.buffer[key].rotation.w
                        );
                    }

                    if(data.contacts?.[key]) {
                        mesh.contacts = data.contacts[key];
                    } else if(mesh.contacts) delete mesh.contacts; //delete old contacts on this frame
                }
            }
        }

        return data; //echo for chaining threads
    },
    removeEntity:function (
        _id:string,
        ctx?:string|WorkerCanvas
    ) {

        if(!ctx || typeof ctx === 'string')
            ctx = this.__graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        // const nav = ctx.nav as BABYLON.RecastJSPlugin;
        // const engine = ctx.engine as BABYLON.Engine;
        const scene = ctx.scene as BABYLON.Scene;

        let mesh = scene.getNodeByName(_id as string) as PhysicsMesh;//scene.getMeshByName(_id) as PhysicsMesh;
        if(!mesh) return undefined; //already removed

        if(ctx.crowds) {
            if(mesh.crowd) {
                ctx.crowds[mesh.crowd].entities.find((o,i) => { 
                    if(o.id === _id) {
                        ((ctx as any).crowds[(ctx as any).entities[_id].crowdId].crowd as BABYLON.ICrowd).removeAgent(i);
                        (ctx as any).crowds[(ctx as any).entities[_id].crowdId].entities.splice(i,1);
                        return true;
                    } 
                });
            }
        }
        if(ctx.navMesh) {
            if(mesh.navMesh && ctx.navMesh) {
                ctx.navMesh.meshesToMerge.find((o,i) => {
                    if(o.id === _id) {
                        ((ctx as any).navMesh.meshesToMerge as BABYLON.Mesh[]).splice(i,1);
                        this.__graph.run(
                            'createNavMesh',  
                            (ctx as any).navMesh.meshesToMerge,  
                            (ctx as any).navMesh.navMeshParameters, 
                            (ctx as any).navMesh.debug,
                            (ctx as any).navMesh.sendDebug,
                            undefined,
                            (ctx as any)._id
                        );

                        

                        return true;
                    }
                })
            }
        }


        if(this.__graph.get(_id)) 
            (this.__graph as WorkerService).remove(_id);


        if(ctx.navPort) {
            const navWorker = this.__graph.workers[ctx.navPort];
            (navWorker as WorkerInfo).post('removeEntity', mesh.id);
        }

        if(ctx.physicsPort) {
            const physicsWorker = this.__graph.workers[ctx.physicsPort];
            (physicsWorker as WorkerInfo).post('removePhysicsEntity', mesh.id);
        }
        
        if(ctx.particles?.[_id]) {
            //deal with particle systems
            let split = _id.split('_');
            let pIdx = parseInt(split.pop() as string);
            let pSystemId = split.join('_');
            let pSystem = this.__graph.particleSystems[pSystemId] as BABYLON.SolidParticleSystem;
            pSystem.removeParticles(pIdx,pIdx);
        } else if (ctx.particleSystems?.[_id]) {
            const pSystem = ctx.particleSystems[_id] as BABYLON.SolidParticleSystem;
            pSystem.removeParticles(0,pSystem.nbParticles);
        } else if (ctx.instances?.[_id]) {
            //deal with thin instances
        }
        else scene.removeMesh(mesh); //generic mesh object

        if(ctx.shadowGenerator) {
            (ctx.shadowGenerator as BABYLON.ShadowGenerator).removeShadowCaster(mesh, true);
        }

        //quick references
        delete ctx.entities[_id];
        if(ctx.animations?.[_id]) delete ctx.animations[_id]; //if any animations defined for this mesh
        if(ctx.particles?.[_id]) delete ctx.particles[_id]; //if the entity is a particle

        return _id; //echo id for physics and nav threads to remove to remove by subscribing
    },

    ///we should handle flowfield and velocity updates on a separate thread and just report positions to babylon

    //well let's think through if we can use a single set of instances and the maximum of 4 light sources
    
    //or maybe we can instance just a cell (i.e. 4-8 rectangles instanced and reshaped) and then assign light sources per cell (e.g. 2)
    // then have the flashlight plus a global light source additionally

    //we need to also add them to the physics world

    //babylon entities render
    renderMaze:function(
        maze, 
        allowDiagonal, 
        ctx
    ) {

        if(!ctx || typeof ctx === 'string')
            ctx = this.__graph.run('getCanvas',ctx);
        // Create a built-in "box" shape; its constructor takes 6 params: name, size, scene, updatable, sideOrientation
        let wallTemplate;

        this.__graph.run('clearWallsAndFloors', ctx); //clear prev

        ctx.maze = new Maze();
        ctx.maze.setCellData(maze.cells,allowDiagonal); //for reference

        const scene = ctx.scene;
        const shadowMap = ctx.shadowMap;
        const physicsWorker = (this.__graph as WorkerService).workers[ctx.physicsPort];
        
        const dimensions = allowDiagonal ? {height: 1, width: 0.05, depth: 1/Math.sqrt(6)} : {height: 1, width: 0.1, depth: 1}

        wallTemplate = BABYLON.MeshBuilder.CreateBox('wall_', dimensions, scene);

        wallTemplate.receiveShadows = true;
        wallTemplate.isVisible = false; // Set the original wall as invisible; it's just a template


        let wallMaterial = new BABYLON.StandardMaterial("wallMaterial", scene);
        //wallMaterial.disableLighting = true;

        (wallMaterial as any).shadowEnabled = true;

        const cellSize = 1;
        const cellOffset = cellSize*0.5;

        //TODO: DOORS
        // Function to create and position a wall based on the MazeCell
        function createWall(cell, direction, isDoor=false, color?) {
            if(!isDoor && ((direction === 'down' && cell.y !== maze.height -1) || (direction === 'right' && cell.x !== maze.width -1))) {
                return;
            }
            const _id = (isDoor ? 'door_' : 'wall_') + cell.x + '_' + cell.y + '_' + direction;

            let instance = isDoor ? BABYLON.MeshBuilder.CreateBox(_id, dimensions, scene) : wallTemplate.createInstance(_id);
            instance.isVisible = true;
            //instance.alwaysSelectAsActiveMesh = true;
            shadowMap.renderList.push(instance);
            instance.rotationQuaternion = new BABYLON.Quaternion();

            // Apply the color to the instance
            if(color) (instance as any).color = color; // Set the color directly to the instance
            else instance.color = new BABYLON.Color4(1,1,1,1);

            if(isDoor) {
                instance.receiveShadows = true;

                let wallMaterial = new BABYLON.StandardMaterial("doorMaterial", scene);
                //wallMaterial.disableLighting = true;

                (wallMaterial as any).shadowEnabled = true;

                wallMaterial.diffuseColor = color;

                instance.material = wallMaterial;

            }

            switch (direction) {
                case 'up':
                instance.position = new BABYLON.Vector3(cell.x * cellSize - cellOffset, cellOffset, cell.y * cellSize - cellSize);
                instance.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0,Math.PI / 2,0); // Wall is aligned along the x-axis
                break;
                case 'down':
                //if(isDoor || cell.y === maze.height -1) {
                    instance.position = new BABYLON.Vector3(cell.x * cellSize - cellOffset, cellOffset, cell.y * cellSize);
                    instance.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0,Math.PI / 2,0); // Wall is aligned along the x-axis
                //}
                break;
                case 'right':
                //if(isDoor || cell.x === maze.width -1) {
                    instance.position = new BABYLON.Vector3(cell.x * cellSize, cellOffset, cell.y * cellSize - cellOffset);
                    instance.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0,0,0); // Wall is aligned along the x-axis
                //}
                break;
                case 'left':
                instance.position = new BABYLON.Vector3(cell.x * cellSize - cellSize, cellOffset, cell.y * cellSize - cellOffset);
                instance.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0,0,0); // Wall is aligned along the x-axis
                break;
            }
            if(allowDiagonal) {
                let radius = cellSize / 2
                switch(direction) {
                case 'upLeft':
                    instance.position = new BABYLON.Vector3(
                        cell.x * cellSize + radius * Math.cos(5 * Math.PI / 4) - radius, // x position
                        0.5, // y position (assuming walls are centered vertically)
                        cell.y * cellSize + radius * Math.sin(5 * Math.PI / 4) - radius // z position
                    );
                    //instance.rotation.y = 3 * Math.PI / 4; // 45 degrees for diagonal alignment
                    instance.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0,3 * Math.PI / 4,0);
                    break;
                case 'upRight':
                    instance.position = new BABYLON.Vector3(
                        cell.x * cellSize + radius * Math.cos(7 * Math.PI / 4) - radius,
                        0.5,
                        cell.y * cellSize + radius * Math.sin(7 * Math.PI / 4) - radius
                    );
                    instance.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0,Math.PI / 4,0);
                    break;
                case 'downLeft':
                    instance.position = new BABYLON.Vector3(
                        cell.x * cellSize + radius * Math.cos(3 * Math.PI / 4) - radius,
                        0.5,
                        cell.y * cellSize + radius * Math.sin(3 * Math.PI / 4) - radius
                    );
                    instance.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0,Math.PI / 4,0);
                    break;
                case 'downRight':
                    instance.position = new BABYLON.Vector3(
                        cell.x * cellSize + radius * Math.cos(Math.PI / 4) - radius,
                        0.5,
                        cell.y * cellSize + radius * Math.sin(Math.PI / 4) - radius
                    );
                    //instance.rotation.y = 3 * Math.PI / 4; // 135 degrees for diagonal alignment
                    instance.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0,3 * Math.PI / 4,0);
                    break;
                }
            }

            physicsWorker.post('addPhysicsEntity',{
                _id,
                collisionType:'cuboid',
                dimensions:dimensions,
                restitution:1,
                position:{
                    x:instance.position.x,
                    y:instance.position.y,
                    z:instance.position.z
                },
                rotation:{
                    x:instance.rotationQuaternion._x,
                    y:instance.rotationQuaternion._y,
                    z:instance.rotationQuaternion._z,
                    w:instance.rotationQuaternion._w
                }
            });

            return instance;
        }


        // Create a template plane for the floor tiles
        var floorTileTemplate = BABYLON.MeshBuilder.CreateBox('tile_', {height: 1, width: 1, depth: 0.1}, scene);
        floorTileTemplate.isVisible = false; // Set the original tile as invisible; it's just a template
        // Prepare material for all tiles
        var tileMaterial = new BABYLON.StandardMaterial("tileMaterial", scene);
        //tileMaterial.disableLighting = true;

        floorTileTemplate.receiveShadows = true;
        (tileMaterial as any).shadowEnabled = true;

        tileMaterial.specularColor = new BABYLON.Color3(0,0,0);

        //tileMaterial.emissiveColor = BABYLON.Color3.White();

        // Function to create and color a floor tile based on the MazeCell
        function createFloorTile(cell, row, col) {
            const _id = 'tile_' + cell.x + '_' + cell.y;
            let instance = (cell.isStart || cell.isEnd) ? BABYLON.MeshBuilder.CreateBox('tile_', {height: 1, width: 1, depth: 0.1}, scene) : floorTileTemplate.createInstance(_id);
            instance.position = new BABYLON.Vector3((cell.x - cellOffset), 0, (cell.y - cellOffset)); // Adjust position to account for size
           
            //instance.alwaysSelectAsActiveMesh = true;
            instance.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(Math.PI / 2,0,0); // Rotate to lay flat
            shadowMap.renderList.push(instance);
            // Assign a color to the instance based on cell properties

            if(cell.isStart || cell.isEnd) {
                // Prepare material for all tiles
                var tileMaterial = new BABYLON.StandardMaterial("tileInstanceMaterial", scene);
                //tileMaterial.disableLighting = true;

                instance.receiveShadows = true;
                (tileMaterial as any).shadowEnabled = true;

                tileMaterial.specularColor = new BABYLON.Color3(0,0,0);
                
                var color;
                if (cell.isStart) {
                    color = new BABYLON.Color4(0, 1, 0, 1); // Start cell is green
                } else if (cell.isEnd) {
                    color = new BABYLON.Color4(1, 0, 0, 1); // End cell is red
                } 
                tileMaterial.diffuseColor = color;

                instance.material = tileMaterial;

            } else {
                let color = new BABYLON.Color4(0.0, 0.0, 0.2, 1); // default color (gray)
    
                // Apply the color to the instance
                (instance as any).color = color; // Set the color directly to the instance
    
            }
          
            physicsWorker.post('addPhysicsEntity',{
                _id,
                collisionType:'cuboid',
                dimensions:{height: 1, width: 1, depth: 0.1},
                restitution:1,
                position:{
                    x:instance.position.x,
                    y:instance.position.y,
                    z:instance.position.z
                },
                rotation:{
                    x:instance.rotationQuaternion._x,
                    y:instance.rotationQuaternion._y,
                    z:instance.rotationQuaternion._z,
                    w:instance.rotationQuaternion._w
                }
            });

            return instance;
        }

        //need a pass to create columns

        //console.log(maze);
        function setInstances() {
                
            // Setup color buffer
            let instanceCount = maze.width * maze.height - 2; //skip start and end tiles which are their own objects
            let floorColorData = new Float32Array(4 * instanceCount);
            let wallColorData;
            let index = 0;

            let wallColors = [] as number[];
            // Loop to create all tiles with their respective colors
            for (var y = 0; y < maze.height; y++) {
                for (var x = 0; x < maze.width; x++) {
                    let cell = maze.cells[y][x];
                    let tile = createFloorTile(cell, y, x) as any;
                    // Compute color data index
                    if(!cell.isStart && !cell.isEnd) {
                        let colorIndex = index * 4;
                        floorColorData[colorIndex] = tile.color.r;
                        floorColorData[colorIndex + 1] = tile.color.g;
                        floorColorData[colorIndex + 2] = tile.color.b;
                        floorColorData[colorIndex + 3] = tile.color.a;
                        index++;
                    }
              

                    for (let wallDirection in cell.walls) {
                        if (cell.walls[wallDirection]) {
                            let wall = createWall(cell, wallDirection);
                            wallColors.push(0.3,0,0.3,1);
                        }
                    }
                    if(cell.doors) {
                        for(let wallDirection in cell.doors) {
                            if (cell.doors?.[wallDirection]) {
                                let cstr = cell.doors[wallDirection]; if(typeof cstr !== 'string') cstr = 'red';
                                let color;
                                if(cstr === 'red') color = new BABYLON.Color4(1,0,0,1);
                                else if (cstr === 'green') color = new BABYLON.Color4(0,1,0,1);
                                else if (cstr === 'blue') color = new BABYLON.Color4(0,0,1,1);
                                else if (cstr === 'purple') color = new BABYLON.Color4(1,0,1,1);
                                else if (cstr === 'yellow') color = new BABYLON.Color4(1,1,0,1);
                                else if (cstr === 'cyan') color = new BABYLON.Color4(0,1,1,1);

                                if(!ctx.doors[cstr]) ctx.doors[cstr] = [] as any[];
    
                                let wall = createWall(cell, wallDirection, true, color);
                                //wallColors.push(color.r, color.g, color.b, color.a);

                                ctx.doors[cstr].push(wall);
                            }
                        }
                    }

                    if(cell.keys) {
                        let keys = Object.keys(cell.keys);
                        let keyIndex = 0; // To offset multiple keys within the same cell
                    
                        keys.forEach(keyColor => {
                            let color;
                            switch (keyColor) {
                                case 'red':
                                    color = new BABYLON.Color4(1, 0, 0, 1);
                                    break;
                                case 'green':
                                    color = new BABYLON.Color4(0, 1, 0, 1);
                                    break;
                                case 'blue':
                                    color = new BABYLON.Color4(0, 0, 1, 1);
                                    break;
                                case 'purple':
                                    color = new BABYLON.Color4(1, 0, 1, 1);
                                    break;
                                case 'yellow':
                                    color = new BABYLON.Color4(1, 1, 0, 1);
                                    break;
                                case 'cyan':
                                    color = new BABYLON.Color4(0, 1, 1, 1);
                                    break;
                                default:
                                    color = new BABYLON.Color4(1, 1, 1, 1); // Fallback for an unknown color
                            }
                    
                            let _id = keyColor;
                            let keyBox = BABYLON.MeshBuilder.CreateBox(_id, {height: 0.2, width: 0.2, depth: 0.2}, scene);
                            keyBox.position = new BABYLON.Vector3(cell.x + (keyIndex * 0.25) - 0.5, 0.25, cell.y - 0.5); // Position keys with some offset
                            
                            let keyMaterial = new BABYLON.StandardMaterial("keyMaterial_" + keyColor, scene);
                            keyMaterial.diffuseColor = new BABYLON.Color3(color.r, color.g, color.b);
                            keyBox.material = keyMaterial;
                    
                            let starty = keyBox.position.y;
                            ctx.animations[_id] = (frameTimeMs) => {
                                keyBox.rotate(BABYLON.Vector3.Up(),frameTimeMs/(3141));
                                keyBox.rotate(BABYLON.Vector3.Forward(),Math.sin(frameTimeMs/(3141)));
                                //keyBox.position.y = starty + 0.2 * Math.sin(frameTimeMs/(3141))
                            }

                            ctx.keys[_id] = keyBox; //entity reference

                            keyIndex++;
                        });
                    }

                }
            }

            wallColorData = new Float32Array(wallColors); //convert to float32 buffer
            // Apply the color buffer to the root tile
            var buffer = new BABYLON.VertexBuffer(ctx.engine, floorColorData, BABYLON.VertexBuffer.ColorKind, false, false, 4, true);
            floorTileTemplate.setVerticesBuffer(buffer);
            floorTileTemplate.material = tileMaterial;

            var buffer2 = new BABYLON.VertexBuffer(ctx.engine, wallColorData, BABYLON.VertexBuffer.ColorKind, false, false, 4, true);
            wallTemplate.setVerticesBuffer(buffer2);
            wallTemplate.material = wallMaterial;
        }


        setInstances();

    },

    // Function to clear all wall and floor instances from the scene
    clearWallsAndFloors: function(ctx?) {
        if(!ctx || typeof ctx === 'string')
            ctx = this.__graph.run('getCanvas',ctx);

        // Filter all meshes that are instances of walls and floors
        (ctx.scene as BABYLON.Scene).meshes.filter(mesh => {
            if(mesh.name.includes('wall_') || mesh.name.includes('tile_')) {
                mesh.dispose(undefined,true);
                return true;
            }
        });
    },

    //we are gonna have a 2D representation of the maze on a flat plane with a canvas material/
    // It should show keys and the start/end, and your position can be toggled (e.g. based on difficulty)
    // This will be a handheld map
    createMazeMaterial:function() {

    },



    //just add win conditions

    ...navMeshRoutes
};