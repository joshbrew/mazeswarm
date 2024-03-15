
//import * as B from 'babylonjs'
//import * as THREE from 'three'
import { 
    WorkerCanvasControls, 
    WorkerService, 
    Loader,
    GraphNode, 
    WorkerInfo
} from 'graphscript'//'../graphscript/index'//'graphscript'

import {PhysicsEntityProps} from './src/types'

// import keyboard from 'keyboardjs'

// import RAPIER from '@dimforge/rapier3d-compat'

//make as direct children of a renderer node that runs the below function
//let entityLoader:Loader = (node,parent,graph,roots,properties,key) => {}


import physicsworker from './workers/physics.worker'
import renderworker from './workers/renderer.worker'

//notes on performance:
// need to optimize the way the physics thread accesses the flowfield, too much referencing so it does not scale great past 200 or so moving entities
// skinning


export async function createRenderer(
    elm:HTMLCanvasElement, 
    node:GraphNode, 
    graph:WorkerService, 
    entities?:PhysicsEntityProps[],
    minimapelm?:HTMLCanvasElement,
    hpbar?:HTMLProgressElement,
    keyspan?:HTMLSpanElement
) {

    //console.log(graph, elm);
    const renderer = graph.addWorker({url:renderworker}) as WorkerInfo;

    
    const physics = graph.addWorker({url:physicsworker}) as WorkerInfo;
    const navigation = graph.addWorker({url:physicsworker}) as WorkerInfo;
    const minimap = graph.addWorker({url:physicsworker});

    //the physics thread will update the positions of the entities
    // alternatively user inputs can update the positions/forces on the physics thread
    const physicsPort = graph.establishMessageChannel(
        renderer.worker, 
        physics.worker
    );

    const minimapPort = graph.establishMessageChannel(
        physics.worker,
        minimap.worker
    );

    //the navemesh algorithm will update accellerations on the physics thread
    // const navPort = graph.establishMessageChannel(
    //     renderer.worker,
    //     navigation.worker
    // )

    //this will run the flowfield convolve step away from the physics thread
    const navPhysicsPort = graph.establishMessageChannel(
        navigation.worker,
        physics.worker
    )

    node.physics = physics;
    node.navigation = navigation;

    // elm.addEventListener("click", async () => {
    //     await elm.requestPointerLock();
    // });

    // window.addEventListener('keydown', (ev) => {
    //     ev.preventDefault();
    //     //console.log(ev);
    // });

    let _id = elm.id ? elm.id : `renderer${Math.floor(Math.random()*1000000000000000)}`;

    let timeout;

    //jank mouse capture todo: fix/use real virtual cursor with pointer lock and better default preventing
    elm.addEventListener('mouseleave', function() {
        // Request pointer lock
        elm.requestPointerLock =    elm.requestPointerLock ||
                                    elm.mozRequestPointerLock ||
                                    elm.webkitRequestPointerLock;
        elm.requestPointerLock();

        if(timeout) clearTimeout(timeout);

        timeout = setTimeout(()=>{
            document.exitPointerLock =  document.exitPointerLock ||
                                        (document as any).mozExitPointerLock ||
                                        (document as any).webkitExitPointerLock;
            document.exitPointerLock();
        },150);

    });

    // document.addEventListener('pointerlockchange', lockChangeAlert, false);
    // document.addEventListener('mozpointerlockchange', lockChangeAlert, false);
    // document.addEventListener('webkitpointerlockchange', lockChangeAlert, false);

    // function lockChangeAlert() {
    //     if (document.pointerLockElement === elm) {
    //         console.log('Pointer locked');
    //         // Optionally, move the camera or cursor back to the center
    //         // This part is application-specific and might not involve actual cursor movement,
    //         // as the cursor is hidden when locked.

    //     } else {
    //         console.log('Pointer unlocked');
    //         // The pointer has been unlocked, possibly because the user hit ESC.
    //         // Here you could also check if the cursor is within the canvas bounds and react accordingly.
    //     }
    // }

    // await navigation.run('initEngine',{
    //     _id,
    //     entities
    // });


    // let crowds = {};
    // let navMeshes = [] as string[];
    // let targets = {};

    // entities?.forEach((o) => {
    //     if(o.crowd) {
    //         if(!crowds[o.crowd]) crowds[o.crowd] = [];
    //         crowds[o.crowd].push(o._id);
    //     }
    //     if(o.navMesh) {
    //         navMeshes.push(o._id);
    //     }
    //     if(o.targetOf) targets[o.targetOf] = o._id;
    // })

    // let meshCreated = await navigation.run(
    //     'createNavMesh', 
    //     [
    //         navMeshes,
    //         undefined,
    //         true,
    //         navPort //send the resulting mesh to main thread to render
    //     ]
    // );

    //console.log(meshCreated);
    
    // for(const key in crowds) {
    //     let crowdId = await navigation.run(
    //         'createCrowd', 
    //         [
    //             crowds[key], 
    //             targets[key]
    //         ]
    //     );
    // }

    //now let's setup the rapier thread to tell the render thread what to do

    physics.run('initWorld', [
        { x: 0.0, y: -9.81, z:0 } //down is the y-axis in babylon
    ]).then(async () => {

        node.renderer = await graph.run( 
            'transferCanvas',
            renderer.worker,
            {
                canvas:elm,
                context:undefined,
                _id,
                entities,
                //port Ids
                physicsPort,
                //navPort,
                navPhysicsPort,
                //animating:false
            },
            'receiveBabylonCanvas'
        ) as WorkerCanvasControls;


        //update physics trajectories using the navmesh
        // physics.post('subscribeToWorker', [
        //     'stepCrowd', //loop triggered by createCrowd and reports to subscribers
        //     navPhysicsPort,
        //     'updatePhysicsEntities'
        // ]);

        // //update entity positions from the physics thread
        //navigation.post
        

        //update the render thread from the navigation thread
        // renderer.post('subscribeToWorker',[
        //     'updateBabylonEntities',
        //     navPort,
        //     'updateBabylonEntities'
        // ]); //runs entirely off main thread

        //setTimeout(()=>{
        renderer.post('subscribeToWorker',[
            'stepWorld', //loop triggered by animateWorld and reports to subscribers
            physicsPort, //navPhysicsPort,
            'updateBabylonEntities'
        ]);

        //update entities then render scene 
        
        // renderer.post('subscribe',[
        //     'updateBabylonEntities', //loop triggered by animateWorld and reports to subscribers
        //     'renderScene'
        // ]);

        physics.post('animateWorld', [true, true]);


        let offscreen = minimapelm?.transferControlToOffscreen();

        //create the maze and render the entities
        physics.post('createMaze',
            [
                20,
                20,
                'huntandkill',
                Math.random(),
                true,
                7,
                500,
                physicsPort,
                navPhysicsPort,
                minimapPort,
                offscreen || undefined
            ],
            undefined,
            [offscreen]
        );

        //todo win/loss stats, cache long term play stats
        renderer.subscribe('onWin',()=>{
            alert("You won! F5 or refresh page to restart");
        });

        renderer.subscribe('onDie',() => {
            alert("You died! F5 or refresh page to restart");
        });

        renderer.subscribe('onKeyPickup',(color) => {
            if(keyspan)
                keyspan.innerHTML += `<span style="color:${color}; font-size:20px;">⚿</span>`
        })

        renderer.subscribe('onHPLoss',(newHP) => {
            if(hpbar) {
                hpbar.value = newHP;
                if(newHP <= 2.5) hpbar.style.backgroundColor = 'red';
                else if(newHP <= 5) hpbar.style.backgroundColor = 'yellow'; 
            }
        });

        //},1000)
    });

    return {
        _id,
        renderer,
        navigation,
        physics,
        physicsPort,
        //navPort,
        navPhysicsPort
    }
};

