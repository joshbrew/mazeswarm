/*
    TODO:
        Fix camera controls on thread (might have to implement my own <_<)
        Wrap mesh and physics settings together for a single init process
        Implement navmeshes
        Use buffering system to spam a thousand+ entities

*/




//import * as B from 'babylonjs'
//import * as THREE from 'three'
import { 
    WorkerCanvas, 
    WorkerCanvasControls, 
    WorkerInfo,
    WorkerService, 
    htmlloader, 
    workerCanvasRoutes,
    Loader
} from 'graphscript' //'../graphscript/index'//

// import {PhysicsEntityProps} from './workers/types'
// import physicsworker from './workers/physics.worker'
// import renderworker from './workers/renderer.worker'

// import keyboard from 'keyboardjs'

// import RAPIER from '@dimforge/rapier3d-compat'

import { createRenderer } from './renderer';

let renderId = 'canvas';

let graph = new WorkerService({
    roots:{
        ...workerCanvasRoutes,
        [renderId]:{
            __element:'canvas',
            style:{width:'100%', height:'100%'},
            __onrender:async function(elm) {

                const minimap = document.getElementById('minimap') as HTMLCanvasElement;
                const hpbar = document.getElementById('hpbar') as HTMLProgressElement;
                const keyspan = document.getElementById('keys') as HTMLSpanElement;

                minimap.width = 800;
                minimap.height = 800;
                createRenderer(
                    elm,
                    this,
                    graph,
                    undefined,
                    // [
                    //     {
                    //         _id:'ball1',
                    //         collisionType:'ball',
                    //         radius:1,
                    //         dynamic:true,
                    //         instance:true,
                    //         restitution:0.1,
                    //         position:{x:3,y:2,z:3},
                    //         impulse:{x:0,y:0,z:0},
                    //         crowd:'zombies'
                    //         //force:{x:0,y:0,z:30}
                    //     },
                    //     {
                    //         _id:'ball2',
                    //         collisionType:'ball',
                    //         radius:1,
                    //         dynamic:true,
                    //         instance:true,
                    //         restitution:0.1,
                    //         position:{x:0,y:15,z:5},
                    //         impulse:{x:0,y:15,z:-20},
                    //         crowd:'zombies'
                    //     },
                    //     {
                    //         _id:'ball3',
                    //         collisionType:'ball',
                    //         radius:1,
                    //         dynamic:true,
                    //         instance:true,
                    //         restitution:0.1,
                    //         position:{x:0,y:12,z:7},
                    //         impulse:{x:0,y:15,z:-20},
                    //         crowd:'zombies'
                    //     },
                    //     {
                    //         _id:'ball4',
                    //         collisionType:'ball',
                    //         radius:1,
                    //         dynamic:true,
                    //         instance:true,
                    //         restitution:0.1,
                    //         position:{x:0,y:11,z:6},
                    //         impulse:{x:0,y:15,z:-20},
                    //         crowd:'zombies'
                    //     },
                    //     {
                    //         _id:'capsule1', //kinda jank
                    //         collisionType:'capsule',
                    //         radius:1,
                    //         halfHeight:1,
                    //         dynamic:true,
                    //         restitution:0.5,
                    //         position:{x:0,y:5,z:-3},
                    //         rotation:{x:1,y:0,z:0,w:1},
                    //         targetOf:'zombies'
                    //         //impulse:{x:0,y:0,z:30}
                    //     },
                    //     {
                    //         _id:'box1', //kinda jank
                    //         collisionType:'cuboid',
                    //         dimensions:{width:2,height:2,depth:2},
                    //         dynamic:true,
                    //         instance:true,
                    //         restitution:0.1,
                    //         position:{x:-3,y:15,z:3},
                    //         //impulse:{x:0,y:0,z:0}
                    //     },
                    //     {
                    //         _id:'ground',
                    //         collisionType:'cuboid',
                    //         dimensions:{width:10,height:1,depth:10},
                    //         dynamic:false,
                    //         restitution:1,
                    //         position:{x:0,y:0,z:0},
                    //         navMesh:true
                    //     },
                    //     {
                    //         _id:'leftwall',
                    //         collisionType:'cuboid',
                    //         dimensions:{width:10,height:10,depth:1},
                    //         dynamic:false,
                    //         restitution:1,
                    //         position:{x:0,y:5,z:-5},
                    //         navMesh:true
                    //     },
                    //     {
                    //         _id:'rightwall',
                    //         collisionType:'cuboid',
                    //         dimensions:{width:10,height:10,depth:1},
                    //         dynamic:false,
                    //         restitution:1,
                    //         position:{x:0,y:5,z:5},
                    //         navMesh:true
                    //     },
                    //     {
                    //         _id:'ground2',
                    //         collisionType:'cuboid',
                    //         dimensions:{width:100,height:1,depth:100},
                    //         dynamic:false,
                    //         restitution:1,
                    //         position:{x:0,y:-10,z:0},
                    //         navMesh:true
                    //     },
                    //     {
                    //         _id:'leftgwall',
                    //         collisionType:'cuboid',
                    //         dimensions:{width:100,height:5,depth:1},
                    //         dynamic:false,
                    //         restitution:1,
                    //         position:{x:0,y:-7.5,z:-50},
                    //         navMesh:true
                    //     },
                    //     {
                    //         _id:'rightgwall',
                    //         collisionType:'cuboid',
                    //         dimensions:{width:100,height:5,depth:1},
                    //         dynamic:false,
                    //         restitution:1,
                    //         position:{x:0,y:-7.5,z:50},
                    //         navMesh:true
                    //     },
                    //     {
                    //         _id:'frontgwall',
                    //         collisionType:'cuboid',
                    //         dimensions:{width:1,height:5,depth:100},
                    //         dynamic:false,
                    //         restitution:1,
                    //         position:{x:-50,y:-7.5,z:0},
                    //         navMesh:true
                    //     },
                    //     {
                    //         _id:'backgwall',
                    //         collisionType:'cuboid',
                    //         dimensions:{width:1,height:5,depth:100},
                    //         dynamic:false,
                    //         restitution:1,
                    //         position:{x:50,y:-7.5,z:0},
                    //         navMesh:true
                    //     }
                    // ]
                    minimap,
                    hpbar,
                    keyspan
                );
            }
        },
        'intromessage':{
            __element:'span',
            style:{
                position:'absolute',
                zIndex:10,
                left:'50%',
                fontSize:'60px',
                color:'white',
                fontWeight:'bolder',
                fontFamily:'consolas',
                transform:'translateX(-50%)'
            },
            innerHTML:`
               &nbsp;FIND THE EXIT<br/>
             ESCAPE THE SWARM<br/>
             &nbsp;USE THE KEYS<br/>
             CHECK YOUR MAP<br/>
            `,
            __onrender:function(elm) {
                setTimeout(()=>{
                    elm.style.display = 'none';
                },2000);
            }
        },
        'minimap':{
            __element:'canvas',
            style:{
                position:'absolute', 
                zIndex:'10', 
                top:'10px', 
                right:'10px', 
                width:'20vw', 
                height:'20vw',
                pointerEvents:'none', 
                backgroundColor:'black'
            }
        },
        'hpspan':{
            __element:'span',
            __children:{
                'hplabel':{
                    __element:'span',
                    innerHTML:'HP:',
                    style:{
                        fontSize:'10px',
                        backgroundColor:'rgba(10,10,10,0.75)'
                    }
                },
                'hpbar':{
                    __element:'progress',
                    style:{
                        backgroundColor:'green',
                        width:'20vw',
                        height:'10px',
                    },
                    value:'10',
                    max:'10'
                }
            }, 
            style:{
                position:'absolute',
                zIndex:'10',
                top:'10px',
                left:'10px',
            },
        },
        'keys': {
            __element:'span',
            style:{
                position:'absolute',
                zIndex:'10',
                top:'35px',
                left:'10px'
            }
        },
        'controlsRef':{
            __element:'div',
            style:{fontFamily:'consolas'},
            innerHTML:`
                MazeSwarm Controls:<br><br>
                WASD or Arrows: Move Free Camera<br/>
                Shift: Sprint (double speed)<br/>
                Space: Up<br/>
                Ctrl: Down<br/>
                Mouse Click: Shoot<br/>
                Z: Change camera view<br/>
                Hold Alt: Placement Mode<br/>
                Alt + Mouse Click: Place/Delete Object<br/>
                Alt + Mouse Wheel: Change Placement Type<br/><br/>
                Backspace: Release Control back to Free Camera<br/>
                <br/>
                Note this is all rough draft, we did not finish the graphics or audio just the basic win/loss gameplay. Expect jank and limited engagement factor.
                `
        }

        // testbox:{
        //     __element:'div',
        //     style:{backgroundColor:'blue', height:'50px'},
        //     __onrender:function(elm:HTMLElement) {
        //         console.log(elm,elm.addEventListener);
        //         elm.addEventListener('focus', (ev) => {console.log(ev)})
        //     }
        // }
    },
    loaders:{
        htmlloader
    }
});



// RAPIER.init().then(() => {
    
//     //create Rapier3D context
//     let gravity = { x: 0.0, y: -9.81, z:0 };
//     let world = new RAPIER.World(gravity);

//     let initialPosition = {x:0.0,y:10.0,z:0};
//     let radius = 1;

//     //create a dynamic rigid body
//     let rigidBody1 = world.createRigidBody(
//         new RAPIER.RigidBodyDesc(
//             RAPIER.RigidBodyType.Dynamic
//         ).setTranslation(initialPosition.x,initialPosition.y,initialPosition.z),
//     );

//     //create a collision model for the body

//     let collider1 = world.createCollider(
//         RAPIER.ColliderDesc.ball(radius).setDensity(1).setRestitution(2), 
//         rigidBody1
//     );

//     //e.g. add an impulse to the body

//     rigidBody1.applyImpulse(
//         new RAPIER.Vector3(0,25,0),true
//     );

//     let groundPosition = {x:0,y:0,z:0};

//     //create ground plane
//     let ground = world.createRigidBody(
//         new RAPIER.RigidBodyDesc(
//             RAPIER.RigidBodyType.Fixed
//         ).setTranslation(groundPosition.x,groundPosition.y,groundPosition.z)
//     );

//     //create a collision model for the ground plane
//     let gcollider = world.createCollider(
//         RAPIER.ColliderDesc.cuboid(10,1,10).setDensity(1),
//         ground
//     );

//     //add to world

    // let canvas = document.createElement('canvas');

    // let engine = new B.Engine(canvas);

    // let scene = new B.Scene(engine);

    // let camera = new B.FreeCamera('camera1', new B.Vector3(-20, 10, 0), scene);

    // camera.attachControl(canvas, false);

    //let model = {

        // engine:{
        //     __props:engine
        // },
    
        // scene:{
        //     __props:scene
        // },
    
        // camera: {
        //     __props:camera,
        // },

        // light: {
        //     __props: new B.HemisphericLight('light1', new B.Vector3(0,1,0), scene)
        // },

        // rigidBody1:{
        //     __props:B.MeshBuilder.CreateSphere('rigidBody1',{diameter:radius*2, segments: 32}, scene),
        //     position: new B.Vector3(
        //         initialPosition.x,
        //         initialPosition.y,
        //         initialPosition.z
        //     ),
        //     __onconnected:function(node) {
        //         camera.setTarget(this.position);
        //     }
        // },

        // ground:{
        //     __props:B.MeshBuilder.CreateBox('ground',{width:10, height:2, depth:10},scene),
        //     position: new B.Vector3(
        //         groundPosition.x,
        //         groundPosition.y,
        //         groundPosition.z
        //     )
        // }
    
    //}


//     let body = graph.get('rigidBody1');

//     engine.runRenderLoop(function(){
//         world.step();
//         let newPosition = rigidBody1.translation();
//         body.position.x = newPosition.x;
//         body.position.y = newPosition.y;
//         body.position.z = newPosition.z;
//         scene.render();

//     });

//     // the canvas/window resize event handler
//     window.addEventListener('resize', function(){
//         engine.resize();
//     });

//     setTimeout(()=>{
//         engine.resize();
//     },0.1)


// });

/// Create a grid map
// Populate grid map with boxes
// Make entities have sphere collisions
// Make entities chase player (also sphere) thru environment
// Conserve momentum with mass collisions

// let a_handler = (ev) => {
//     alert('Pressed a');
//     keyboard.unbind('a',a_handler);
// }

// keyboard.on('a',a_handler); 


