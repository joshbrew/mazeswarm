import {
    WorkerCanvas,  
    WorkerInfo,
    //recursivelyAssign,
} from 'graphscript'

import * as BABYLON from 'babylonjs'

import Recast from  "recast-detour"

import { Vec3 } from '../src/types';


type PhysicsMesh = (BABYLON.Mesh | BABYLON.InstancedMesh) & { 
    contacts?:string[], 
    dynamic?:boolean | "kinematicP" | "kinematicV" , collisionType?:string, navMesh?:boolean, 
    crowd?:string, agentState?:string|number, patrol?:Vec3[], origin?:Vec3
};

export const navMeshRoutes = {
    createNavMeshData: async (data) => {
        // get message datas
        const recast = await Recast() as any;
        const positions = data[0];
        const offset = data[1];
        const indices = data[2];
        const indicesLength = data[3];
        const parameters = data[4];
    
        // initialize Recast
        //Recast().then((recast) => {
        // build rc config from parameters
        const rc = new recast.rcConfig();
        rc.cs = parameters.cs;
        rc.ch = parameters.ch;
        rc.borderSize = parameters.borderSize ? parameters.borderSize : 0;
        rc.tileSize = parameters.tileSize ? parameters.tileSize : 0;
        rc.walkableSlopeAngle = parameters.walkableSlopeAngle;
        rc.walkableHeight = parameters.walkableHeight;
        rc.walkableClimb = parameters.walkableClimb;
        rc.walkableRadius = parameters.walkableRadius;
        rc.maxEdgeLen = parameters.maxEdgeLen;
        rc.maxSimplificationError = parameters.maxSimplificationError;
        rc.minRegionArea = parameters.minRegionArea;
        rc.mergeRegionArea = parameters.mergeRegionArea;
        rc.maxVertsPerPoly = parameters.maxVertsPerPoly;
        rc.detailSampleDist = parameters.detailSampleDist;
        rc.detailSampleMaxError = parameters.detailSampleMaxError;
    
        // create navmesh and build it from message datas
        const navMesh = new recast.NavMesh();
        navMesh.build(positions, offset, indices, indicesLength, rc);
    
        // get recast uint8array
        const navmeshData = navMesh.getNavmeshData();
        const arrView = new Uint8Array(recast.HEAPU8.buffer, navmeshData.dataPointer, navmeshData.size);
        const ret = new Uint8Array(navmeshData.size);
        ret.set(arrView);
        navMesh.freeNavmeshData(navmeshData);
    
        // job done, returns the result
        return ret;//postMessage(ret);
        //});
    },
    createNavMesh:async function(
        meshesToMerge:BABYLON.Mesh[]|string[], 
        params?:BABYLON.INavMeshParameters,
        debug?:boolean,
        sendDebug?:string, //send the mesh to a port to render the debug?
        useWorker?:string, //custom workerURL?
        ctx?:string|WorkerCanvas
    ) {

        if(!ctx || typeof ctx === 'string')
            ctx = this.__graph.run('getCanvas', ctx);

        if(typeof ctx !== 'object') return undefined;

        if(!ctx.nav) ctx.nav = new BABYLON.RecastJSPlugin(await Recast()); 
        const scene = ctx.scene as BABYLON.Scene;

        if(typeof meshesToMerge[0] === 'string') {
            meshesToMerge = meshesToMerge.map((o) => { return scene.getMeshById(o); }) as BABYLON.Mesh[]; 
        }

        return this.__graph.run(
            'setNavMeshData', 
            meshesToMerge, 
            params, 
            debug, 
            sendDebug, 
            useWorker, 
            ctx
        );

    },
    setNavMeshData:function(
        meshesToMerge: BABYLON.Mesh[],
        params?:BABYLON.INavMeshParameters,
        debug?:boolean,
        sendDebug?:string, //send the mesh to a port to render the debug?
        useWorker?:string, //custom workerURL?
        ctx?:string|WorkerCanvas
    ) {

        if(!ctx || typeof ctx === 'string')
            ctx = this.__graph.run('getCanvas', ctx);

        if(typeof ctx !== 'object') return undefined;

        const nav = ctx.nav as BABYLON.RecastJSPlugin;
        const scene = ctx.scene as BABYLON.Scene;

        var navMeshParameters = {
            cs: 0.2,
            ch: 0.2,
            walkableSlopeAngle: 90,
            walkableHeight: 10.0,
            walkableClimb: 3,
            walkableRadius: 5,
            maxEdgeLen: 12.,
            maxSimplificationError: 1.3,
            minRegionArea: 8,
            mergeRegionArea: 20,
            maxVertsPerPoly: 6,
            detailSampleDist: 6,
            detailSampleMaxError: 1,
        } as BABYLON.INavMeshParameters;

        if(params) Object.assign(navMeshParameters,params);

        let merged = BABYLON.Mesh.MergeMeshes(meshesToMerge as BABYLON.Mesh[], false, true);

        //@ts-ignore
        if(!nav._worker) {
            // use a secondary worker to load the navMeshes
            const workerUrl = typeof useWorker === 'string' ? useWorker : `${location.origin}/dist/navmeshwkr.js`; //default 

            let worker = new Worker(workerUrl);
            //@ts-ignore
            nav._worker = worker;
        }

        const withNavMesh = (navMeshData:Uint8Array) => {
            //console.log(navMeshData);
            
            (ctx as WorkerCanvas).navMesh = {
                navMeshData, 
                merged, 
                meshesToMerge, 
                navMeshParameters, 
                debug, 
                sendDebug
            };
            
            nav.buildFromNavmeshData(navMeshData);

            //now we need to remake the crowds to account for the new navmesh data
            if((ctx as WorkerCanvas).crowds) {
                for(const key in (ctx as WorkerCanvas).crowds) {
                    this.__graph.run(
                        'createCrowd', 
                        (ctx as WorkerCanvas).crowds[key].entities, 
                        (ctx as WorkerCanvas).crowds[key].target, 
                        (ctx as WorkerCanvas).crowds[key].agentParams, 
                        ctx
                    );
                }
            }

            //-------------------------
            //----------debug----------
            //-------------------------
            if(debug) {
                let debugNavMesh = nav.createDebugNavMesh(scene);
                if(sendDebug) {
                    let data = debugNavMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
                    let indices = debugNavMesh.getIndices();
                    setTimeout(() => {
                        (this.__graph.workers[sendDebug] as WorkerInfo)?.post(
                            'createDebugNavMesh', 
                            [data, indices, (ctx as WorkerCanvas)._id]
                        );
                    }, 100);
                } else {
                    debugNavMesh.position = new BABYLON.Vector3(0, 0.01, 0);
                    let matdebug = new BABYLON.StandardMaterial('matdebug', scene);
                    matdebug.diffuseColor = new BABYLON.Color3(0.1, 0.2, 1);
                    matdebug.alpha = 0.2;
                    debugNavMesh.material = matdebug;
                }
            }
            //-------------------------
            //-------------------------
            //-------------------------
            return true; //will live on ctx.navMesh
        }

        return new Promise((res) => {
            nav.createNavMesh(
                [merged as any], 
                navMeshParameters, 
                (navMeshData) => {
                    let created = withNavMesh(navMeshData);
                    res(created); //will live on ctx.navMesh
                }
            )
        });
    },
    addToNavMesh:function(meshes:BABYLON.Mesh[]|string[], ctx?:string|WorkerCanvas) {
        if(!ctx || typeof ctx === 'string')
            ctx = this.__graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        const scene = ctx.scene as BABYLON.Scene;

        if(ctx.navMesh) {
            if(typeof meshes[0] === 'string') {
                meshes = meshes.map((o) => { return scene.getMeshById(o); }) as BABYLON.Mesh[]; 
            }

            meshes = [...meshes, ...ctx.navMesh.meshesToMerge];

            this.__graph.run(
                'setNavMeshData', 
                meshes, 
                ctx.navMesh.navMeshParameters, 
                ctx.navMesh.debug, 
                ctx.navMesh.sendDebug
            );

        } else this.__graph.run('setNavMeshData', meshes, ctx);

    },
    removeFromNavMesh:function(mesh:string|BABYLON.Mesh, ctx?:string|WorkerCanvas) {
        if(!ctx || typeof ctx === 'string')
            ctx = this.__graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        if(ctx.navMesh) {
            if(typeof mesh === 'object') {
                mesh = mesh.id;
            }

            ctx.navMesh.meshesToMerge.find((o,i) => {
                if(o.id === mesh) {
                    (ctx as WorkerCanvas).navMesh.meshesToMerge.splice(i,1);
                    return true;
                }
            });

            this.__graph.run(
                'setNavMeshData', 
                ctx.navMesh.meshesToMerge, 
                ctx.navMesh.navMeshParameters, 
                ctx.navMesh.debug, 
                ctx.navMesh.sendDebug
            );
        }
    },
    createDebugNavMesh:function(data:BABYLON.FloatArray, indices: BABYLON.IndicesArray, ctx?:WorkerCanvas|string) {

        if(!ctx || typeof ctx === 'string')
            ctx = this.__graph.run('getCanvas', ctx);
        if(typeof ctx !== 'object') return undefined;
        
        const scene = ctx.scene as BABYLON.Scene;

        let navmeshdebug:BABYLON.Mesh;

        if(scene.getMeshById('navDebugMesh')) {
            let existing = scene.getMeshById('navDebugMesh') as BABYLON.AbstractMesh;
            scene.removeMesh(existing);
            scene.removeMaterial(existing.material as BABYLON.Material);
        }

        navmeshdebug = new BABYLON.Mesh('navDebugMesh', scene);

        let vertexData = new BABYLON.VertexData();
        vertexData.positions = data;
        vertexData.indices = indices;
        
        vertexData.applyToMesh(navmeshdebug);

        navmeshdebug.position = new BABYLON.Vector3(0, 0.01, 0);
        let matdebug = new BABYLON.StandardMaterial('matdebug', scene);
        matdebug.diffuseColor = new BABYLON.Color3(0.1, 0.2, 1);
        matdebug.alpha = 0.2;
        navmeshdebug.material = matdebug;

        //console.log(navmeshdebug);

    },
    createCrowd:async function (
        entities:BABYLON.Mesh[]|string[],
        initialTarget?:BABYLON.Mesh|string,
        params?:Partial<BABYLON.IAgentParameters>,
        ctx?:string|WorkerCanvas
    ) {
        if(!ctx || typeof ctx === 'string')
            ctx = this.__graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        const nav = ctx.nav as BABYLON.RecastJSPlugin;
        const engine = ctx.engine as BABYLON.Engine;
        const scene = ctx.scene as BABYLON.Scene;

        let crowdId;
        if(!ctx.crowds) 
            ctx.crowds = {};

        if(typeof entities[0] === 'string') {
            entities = entities.map((o) => { 
                let mesh = scene.getMeshById(o) as PhysicsMesh;
                return mesh; 
            }) as BABYLON.Mesh[]; 
        }

        for(const e of entities) {
            if(!crowdId) {
                if((e as any).crowd) crowdId = (e as any).crowd;
                else crowdId = `crowd${Math.floor(Math.random()*1000000000000000)}`;
            }
            (e as any).crowd = crowdId;
        }
        
        if(ctx.crowds[crowdId]) { //we are recreating this crowd
            ctx.crowds[crowdId].animating = false; //reset the animation loop
            (ctx.crowds[crowdId].crowd as BABYLON.ICrowd).dispose(); 
            delete ctx.crowds[crowdId];
        }

        let crowd = nav.createCrowd(entities.length, 10, scene);

        if(typeof initialTarget === 'string') 
            initialTarget = scene.getMeshById(initialTarget) as BABYLON.Mesh;
            

        let agentParams = {
            radius: 0.1,
            height: 0.2,
            maxAcceleration: 100.0,
            maxSpeed: 1.0,
            collisionQueryRange: 3,
            pathOptimizationRange: 0.1,
            separationWeight: 1.0
        } as BABYLON.IAgentParameters;

        if(params) Object.assign(agentParams, params);

        let obj = {
            crowd, 
            target:initialTarget, 
            entities, 
            agentParams, 
            animating:true
        };

        ctx.crowds[crowdId] = obj;

        entities.forEach((entity) => {
            if(typeof entity === 'object') {
                if(scene.getTransformNodeById(`${entity.id}TransformNode`)) scene.removeTransformNode(scene.getTransformNodeById(`${entity.id}TransformNode`) as BABYLON.TransformNode);
                let transform = new BABYLON.TransformNode(`${entity.id}TransformNode`, scene);
                let point = nav.getClosestPoint(entity.position);
    
                entity.agentState = 1;
                entity.origin = Object.assign({}, entity.position);
    
                crowd.addAgent(point, agentParams, transform);
            }
        })

        if(typeof initialTarget === 'object') {
            let pick = () => {
                if(!initialTarget) return;
                let direction = BABYLON.Vector3.Down();
                let picked = scene.pickWithRay(
                    new BABYLON.Ray((initialTarget as BABYLON.Mesh).position, direction), 
                    (m) => { if(m.id === (initialTarget as BABYLON.Mesh).id) return false; else return true;}
                );
               
                return picked;
            }

            let point;
            if(initialTarget) {
                const picked = pick();
                if(picked?.pickedPoint) {
                    point = nav.getClosestPoint(picked.pickedPoint); //projected point ensures better navmesh solving
                } else point = nav.getClosestPoint(initialTarget.position);
            }
            crowd.getAgents().forEach((i) => {
                crowd.agentGoto(i, point); 
            });
        }

        let tick = 0;

        let obsv = () => {//scene.onBeforeRenderObservable.add(() => {
            
            if(!obj.animating) return;
            let updates = this.__graph.run(
                'stepCrowd',
                nav,
                scene,
                (ctx as WorkerCanvas).crowds[crowdId].crowd,
                (ctx as WorkerCanvas).crowds[crowdId].entities,
                tick,
                engine.getFps(),
                (ctx as WorkerCanvas).crowds[crowdId].target.position,
                (ctx as WorkerCanvas).crowds[crowdId].target
            );
            tick++;
            //console.log(updates);
            // if(physicsPort) {
            //     this.__graph.workers[physicsPort]?.run('updatePhysicsEntities', updates);
            // }
            
            requestAnimationFrame(obsv);
        };//);
        
        requestAnimationFrame(obsv);

        return crowdId;

    },
    addCrowdAgent:function (
        entity:string|BABYLON.Mesh,
        crowdId:string,
        params?:Partial<BABYLON.IAgentParameters>,
        ctx?:string|WorkerCanvas
    ) {
        if(!ctx || typeof ctx === 'string')
            ctx = this.__graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        const scene = ctx.scene as BABYLON.Scene;

        if(ctx.crowds?.[crowdId]) {
            const crowd = ctx.crowds?.[crowdId].crowd as BABYLON.ICrowd;
            if(typeof entity === 'string') {
                entity = scene.getMeshById(entity) as BABYLON.Mesh;
            }

            let agentParams = {...ctx.crowds[crowdId].agentParams} as BABYLON.IAgentParameters;
    
            if(params) Object.assign(agentParams, params);

            if(typeof entity === 'object') {
                let transform = new BABYLON.TransformNode(`${entity.id}TransformNode`, scene);
                let idx = crowd.addAgent(entity.position, agentParams, transform);

                (entity as PhysicsMesh).agentState = 1; //0: idle/patrol, 1: pursuing target
                ctx.crowds?.[crowdId].entities.push(entity);

                if(ctx.crowds?.[crowdId].target)
                    crowd.agentGoto(idx,ctx.crowds?.[crowdId].target);

                return entity.id;
            }
        }
    },
    removeCrowdAgent:function (meshId:string, ctx?:string|WorkerCanvas) {
        if(!ctx || typeof ctx === 'string')
            ctx = this.__graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        // const nav = ctx.nav as BABYLON.RecastJSPlugin;
        // const engine = ctx.engine as BABYLON.Engine;
        const scene = ctx.scene as BABYLON.Scene;

        let mesh = scene.getNodeByName(meshId) as PhysicsMesh;//scene.getMeshByName(meshId) as PhysicsMesh;
        if(!mesh) return undefined; //already removed

        if(ctx.crowds) {
            if(mesh.crowd) {
                ctx.crowds[mesh.crowd].entities.find((o,i) => { 
                    if(o.id === meshId) {
                        ((ctx as any).crowds[(ctx as any).entities[meshId].crowdId].crowd as BABYLON.ICrowd).removeAgent(i);
                        (ctx as any).crowds[(ctx as any).entities[meshId].crowdId].entities.splice(i,1);
                        return true;
                    } 
                });
            }
        }
    },
    setCrowdTarget:function (
        target:string|BABYLON.Mesh|BABYLON.Vector3,
        crowdId:string,
        ctx?:string|WorkerCanvas
    ) {
        if(!ctx || typeof ctx === 'string')
            ctx = this.__graph.run('getCanvas',ctx);

        if(typeof ctx !== 'object') return undefined;

        const scene = ctx.scene as BABYLON.Scene;
        const nav = ctx.nav as BABYLON.RecastJSPlugin;

        if(ctx.crowds?.[crowdId]) {

            const crowd = ctx.crowds?.[crowdId].crowd as BABYLON.ICrowd;

            if(typeof target === 'string') 
                target = scene.getMeshById(target) as BABYLON.Mesh;

            if(typeof target === 'object') {

                if((target as BABYLON.Mesh)?.position) 
                target = (target as BABYLON.Mesh).position as BABYLON.Vector3;

                let point = nav.getClosestPoint(target as BABYLON.Vector3);

                ctx.crowds[crowdId].target = target;

                crowd.getAgents().forEach((i) => { crowd.agentGoto(i, point); });

            }
        }
    },
    stepCrowd:function( //internal use function, with subscribable outputs on the graph
        nav:BABYLON.RecastJSPlugin,
        scene:BABYLON.Scene,
        crowd:BABYLON.ICrowd,
        entities:BABYLON.Mesh[],
        tick:number,
        fps:number,
        target?:BABYLON.Vector3,
        targetMesh?:BABYLON.Mesh
    ) {

        let needsUpdate = tick % Math.floor(fps*.3) === 0;

        if(needsUpdate) {
            
            entities.forEach((e,i) => { //update the crowd positions based on the physics engine's updates to the meshes
                crowd.agentTeleport(i, e.position);
            });

            if(target) {

                let pick = () => {
                    if(!targetMesh) return;
                    let direction = BABYLON.Vector3.Down();
                    let picked = scene.pickWithRay(
                        new BABYLON.Ray(targetMesh.position, direction), 
                        (m) => { if(m.id === targetMesh.id) return false; else return true;}
                    );
                   
                    return picked;
                }

                let point;
                if(targetMesh) {
                    const picked = pick();
                    if(picked?.pickedPoint) {
                        point = nav.getClosestPoint(picked.pickedPoint); //projected point ensures better navmesh solving
                    } else point = nav.getClosestPoint(target);
                }
                else point = nav.getClosestPoint(target);

                entities.forEach((e:PhysicsMesh, i) => {
                    if(e.agentState === 1) crowd.agentGoto(i, point);
                    else if (e.agentState === 0 && e.patrol) {}  
                });
            }
        
        }
        
        crowd.update(1/fps);

        let agentUpdates = {};

        entities.forEach((e,i) => {
            let agentVelocity = crowd.getAgentVelocity(i);
            //let path = crowd.getAgentNextTargetPath(i)
            //todo: enable specific parameters to update accelerations
            let _fps = 4/fps;
            let addVelocity = {
                x:(agentVelocity.x)*_fps, 
                y:(agentVelocity.y)*_fps,
                z:(agentVelocity.z)*_fps
            };

            // if(needsUpdate) { //provides a stronger direction change impulse
            //     acceleration.x += agentVelocity.x;
            //     acceleration.y += agentVelocity.y;
            //     acceleration.z += agentVelocity.z;
            // }

            agentUpdates[e.id] = {addVelocity};
        })

        return agentUpdates;
        //this.__graph.workers[portId]?.post('updatePhysicsEntity', [entity.id,agentUpdates[entity.id]]);
    }
};