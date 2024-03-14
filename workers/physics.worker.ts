

import { WorkerService } from 'graphscript'
import { physicsRoutes } from '../src/physics.routes';
import { mazeRoutes } from '../src/maze.routes';

declare var WorkerGlobalScope;

if(typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {

    const graph = new WorkerService({
        roots:{
            ...physicsRoutes,
            ...mazeRoutes
        }
    });
    
}

export default self as any;