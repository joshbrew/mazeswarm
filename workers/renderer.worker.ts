import { 
    WorkerService, 
} from 'graphscript'//'../../graphscript/index'//'graphscript'
import { babylonRoutes } from '../src/babylon.routes';

declare var WorkerGlobalScope

if(typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {

    const graph = new WorkerService({
        roots:babylonRoutes
    });


}


export default self as any;