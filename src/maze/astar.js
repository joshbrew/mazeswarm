
//Solvers handle one goal at a time
export class AStarSolver {
    
    maze; start; end;
    openSet = new PriorityQueue();
    closedSet = {};
    searched = {};
    path = [];
    waitTicks = 0;
    waits = {};
    maxF = 0;
    steps = 0; //steps this solution

    //multiagent
    goals = {};
    openSets = {};
    closedSets = {};
    paths = {};
    starts = {}; 
    ends = {};

    animating = false;
    animation; timeout;

    constructor(maze) {
      this.maze = maze;
      this.start = maze.start;
      this.end = maze.end;
    }

    solve = (
        startX = this.maze.start.x, 
        startY = this.maze.start.y,
        endX = this.maze.end.x,
        endY = this.maze.end.y,
        allowDiagonal = this.maze.allowDiagonal,
        rules,
        maxWaitTicks=0 //maximum wait period before aborting
    ) => {

        let start = this.maze.cells[startY][startX];
        let end = this.maze.cells[endY][endX];
        
        if(start === this.start && end === this.end && this.path.length > 0) return this.path; //just return existing path instead of solving again
        
        //console.time('astar');

        this.reset();
    
        this.start = start;
        this.end = end;
        this.initializeCell(this.start);
    
        const openSet = this.openSet;
        const closedSet = this.closedSet;
        openSet.push(this.start, this.start.f);
    
        while (true) {
            const result = this.stepSolver(openSet, closedSet, allowDiagonal, rules, maxWaitTicks);
            if(result && result !== true) break;
        }
        //console.timeEnd('astar');
        return this.path; // No path found
    }

    stepSolver = (openSet, closedSet, allowDiagonal, rules, maxWaitTicks=0) => {
        if(openSet.isEmpty()) return this.path;
        let hasValidMove = false;
        let current = openSet.pop();
        this.searched[current.id] = current;
        closedSet[current.id] = current;

        if (current === this.end) {
            this.path = this.reconstructPath(current, this.waits);
            return this.path;
        }

        for (const neighbor of this.maze.getReachableNeighbors(current, allowDiagonal)) {
            if (closedSet[neighbor.id]) continue;

            this.initializeCell(neighbor);
            let tempG = current.g + 1;
            
            if (!(neighbor.id in openSet.elementIndices) || tempG < neighbor.g) {
                let tempF = tempG + (allowDiagonal ? this.heuristicDiag(neighbor, this.end) : this.heuristicGrid(neighbor, this.end));
                if(rules && !this.applyRules(this.maze, rules, current, neighbor, tempG, tempF, this.waitTicks)) continue;

                hasValidMove = true; if(this.waitTicks) this.waitTicks = 0;
                neighbor.g = tempG;
                neighbor.f = tempF; if(tempF > this.maxF) this.maxF = tempF;
                neighbor.previous = current;

                this.searched[neighbor.id] = neighbor;
                if (!(neighbor.id in openSet.elementIndices)) {
                    openSet.push(neighbor, neighbor.f);
                } else {
                    // Update the priority queue with the new f value
                    openSet.update(neighbor, neighbor.f);
                }
            }
        }

        if (hasValidMove === false) {
            if(this.waitTicks < maxWaitTicks) {
                this.waitTicks++;
                if(!(current.id in this.waits)) this.waits[current.id] = 0;
                this.waits[current.id]++; // Increment wait count for the current cell
                
                openSet.push(current, current.f + 1); // Re-add current cell with a higher cost
                delete closedSet[current.id]; // Remove current cell from closed set for reconsideration
            } else if(openSet.isEmpty()) {
                this.path = this.reconstructPath(current, this.waits); //should allow you to get as close as possible
                return this.path;
            }
        }

        this.steps++;

        return hasValidMove;
    }
        
    initializeCell(cell, gValue = 0) {
        if (!('g' in cell)) {
            cell.g = gValue;
            cell.h = 0;
            cell.f = cell.g + this.heuristicGrid(cell, this.end);
            cell.previous = null;
        }
        return cell;
    }

    //this will decide which cells to skip navigating to based on added rules
    applyRules(maze, rules, current, neighbor, f, g, currentWaitTick) {
        for (const rule in rules) {
            if(typeof rules[rule] === 'function') rules[rule](maze, current, neighbor, f, g, currentWaitTick);
            else if(rule === 'cannotOccupySameCell') {
                if (goal.cannotOccupySameCell && (goal.occupiedCells?.has(neighbor) || goal.previouslyOccupiedCells?.has(neighbor)))
                    return false;
            } else if (rule === 'keys') {
                //doors and keys, supply keys in the rules
                if(neighbor.doors || current.doors) {
                    let direction = maze.getDirection(current,neighbor);
                    let opposite = maze.getOppositeDirection(direction);
                    if(current.doors?.[direction] || neighbor.doors?.[opposite]) {
                        if(current.doors?.[direction] != false || neighbor.doors?.[opposite] != false) { //if door is not false or undefined
                            if(!((current.doors?.[direction] && rules?.keys?.[current.doors[direction]]) ||
                                (neighbor.doors?.[opposite] && rules?.keys?.[neighbor.doors[opposite]]))) {
                                    return false; //if the rules object passed does not contain a key for the corresponding door
                            } //this neighbor is not accessible if door is in way with no key
                        } 
                    }
                }
            }
        }

        return true;
    }

    reconstructPath(end, waits) {
        let current = end;
        let path = [];
        let prev;
        while (current) {
            path.push(current);
            if(waits?.[current.id]) { for(let i = 0; i < waits[current.id]; i++) { path.push(current); }}
            if(current.previous && prev !== current.previous) {
                prev = current;
                current = current.previous;
            } else current = undefined;
            
        }
        return path.reverse();
    }

    reset(multiagent=false) {
        this.maxF = 0;
        this.steps = 0;
        function withCell(cell) { //reset heuristics
            if('g' in cell) {cell.h = 0; cell.f = 0; cell.g = 0;}
            if(cell.heuristics) cell.heuristics = {};
        }
        if(multiagent) {
            for(const key in this.searched) {
                withCell(this.searched[key]);
            }
            for(const key in this.openSets) { //clear these if doing multiagent
                this.openSets[key].reset();
                this.closedSets[key].clear();
            }
            this.paths = {};
            this.searched = {}
        } else {
            this.waitTicks = 0;
            this.waits = {};
            this.openSet.reset();
            this.closedSet = {};
            for(const key in this.searched) {
                withCell(this.searched[key]);
            }
            this.searched = {}
            this.path.length = 0;
        }
    }

    //todo add rules like, cannotOccupySameCell with path projection
    solveMultiple(
        goals, //goals = { agent1:{startX,startY,endX,endY,rules:{cannotOccupySameCell:true,arbitrary:(maze, current, neighbor, f, g, currentWaitTicks)=>{if(condition) return false;}}}}
        allowDiagonal=false,
        maxWaitTicks=5
    ) {

        this.reset(true);
        
        let starts = {}; let ends = {};
        
        let unfinishedKeys = Object.keys(goals);
        let unfinishedGoals = Object.values(goals);

        let agentHasAvoidanceRule = false;
        let waitTicks = {}; let waits = {};
        let previouslyOccupiedCells = undefined; // Set to track previously occupied cells
        let occupiedCells = undefined;

        for(const key in goals) {
            if(!this.openSets[key]) this.openSets[key] = new PriorityQueue();
            else this.openSets[key].reset();
            if(!this.closedSets[key]) this.closedSets[key] = {};
            else this.closedSets[key].clear();
            this.paths[key] = [];
            starts[key] = this.maze.cells[startY][startX];
            ends[key] = this.maze.cells[endY][endX];
            if(this.starts[key] === starts[key] && this.ends[key] === this.ends[key] && this.paths[key]) {
                delete unfinishedKeys[key];
                delete unfinishedGoals[key];
            }
            this.starts[key] = starts[key]
            this.ends[key] = ends[key];

            if(goals[key].rules.cannotOccupySameCell) {
                agentHasAvoidanceRule = true;
                previouslyOccupiedCells = new Set(); // Set to track previously occupied cells
                occupiedCells = new Set();
                goals[key].occupiedCells = occupiedCells; goals[key].previouslyOccupiedCells = goals[key].previouslyOccupiedCells;
            }
            waitTicks[key] = 0;
            waits[key] = {};
        }

        let allEmpty = false;


        do { //we are updating everyone on the same step or up till their goal is reached so we can have concurrent planning
            if(agentHasAvoidanceRule) occupiedCells.clear();

            let i = 0;
            for (const key of unfinishedKeys) { 
                if (!this.openSets[key].isEmpty()) {
                    const goal = goals[key];
                    let current = this.openSets[key].pop();
                    if(!this.searched[current.id]) this.searched[current.id] = current;

                    // Update current position for each agent
                    if(agentHasAvoidanceRule) occupiedCells.add(current);

                    if (current === this.end) {
                        this.paths[key] = this.reconstructPath(current, waits[key]);
                        delete unfinishedGoals[key];
                        unfinishedKeys.splice(i,1);
                        if(unfinishedKeys.length === 0) allEmpty = true;
                        continue;
                    }
    
                    this.closedSets[key][current.id] = current;
    
                    let hasValidMove = false;
                    for (let neighbor of this.maze.getReachableNeighbors(current, allowDiagonal)) {
                        if (this.closedSets[key][neighbor.id]) continue;

                        neighbor = this.initializeCellMulti(neighbor, 0, key);
                        
                        const heuristics = neighbor.heuristics[key];
                        let tempG = heuristics.g + 1;
    
                        if (!(neighbor.id in this.openSets[key].elementIndices) || tempG < heuristics.g) {
                            // Apply rules defined in goals to check the next best pick
                            if (goal.rules && !this.applyRules(this.maze, goal.rules, current, neighbor, waitTicks[key])) continue;
    
                            hasValidMove = true; if(waitTicks[key]) waitTicks[key] = 0;

                            heuristics.g = tempG;
                            heuristics.f = heuristics.g + (allowDiagonal ? this.heuristicDiag(neighbor, ends[key]) : this.heuristicGrid(neighbor, ends[key]));
                            heuristics.previous = current;
                            this.closedSets[key][neighbor.id] = neighbor;

                            if(!this.searched[neighbor.id]) this.searched[neighbor.id] = neighbor;
                            if (!(neighbor.id in this.openSets[key].elementIndices)) {
                                this.openSets[key].push(neighbor, heuristics.f);
                            } else {
                                // Update the priority queue with the new f value
                                this.openSets[key].update(neighbor, heuristics.f);
                            }
                        }
                    }

                    // If no valid move is found, and cannotOccupySameCell rule applies, wait in the current cell
                    if (!hasValidMove) {
                        if(waitTicks[key] < maxWaitTicks) {
                            waitTicks[key]++;
                            if(!waits[key][current.id]) waits[key][current.id] = 0;
                            waits[key][current.id]++; // Increment wait count for the current cell
                            
                            //console.log(`agent ${key} is waiting at ${current.x,current.y}`)
                            this.openSets[key].push(current, current.heuristics[key].f + 1); // Re-add current cell with a higher cost
                            delete this.closedSets[key][current.id]; // Remove current cell from closed set for reconsideration
                        } else if(openSet.isEmpty()) {
                            this.paths[key] = this.reconstructPath(current, waits[key]);
                            //console.log(`Goal for ${key} is currently unreachable.`);
                            delete unfinishedGoals[key];
                            unfinishedKeys.splice(i,1);
                            if(unfinishedKeys.length === 0) allEmpty = true;
                        }
                    }

                } else {
                    //console.log(`Goal for ${key} is currently unreachable.`);
                    delete unfinishedGoals[key];
                    unfinishedKeys.splice(i,1);
                    if(unfinishedKeys.length === 0) allEmpty = true;
                }
                i++;
            }
            if (agentHasAvoidanceRule) {
                previouslyOccupiedCells.clear();
                for (const cell of occupiedCells) {
                    previouslyOccupiedCells.add(cell);
                }
            }
        } while (!allEmpty);
    
        return this.paths;

    }
  
    initializeCellMulti(cell, gValue=0, key) {
        if(!cell.heuristics) cell.heuristics = {};
        if(!cell.heuristics[key]) cell.heuristics[key] = {
            h:0, f:0, g:gValue, previous:null
        };
        return cell;
    }

   
    heuristicGrid(cell1, cell2) { //A heuristic function for grid-based pathfinding.
        // The "Manhattan Distance" is calculated as the absolute difference of the x coordinates
        // plus the absolute difference of the y coordinates. Assumes only horizontal or vertical movement
        return Math.abs(cell1.x - cell2.x) + Math.abs(cell1.y - cell2.y);
    }
  
    //we can allow for diagonal movements like this
    heuristicDiag(cell1, cell2) {
        // The Euclidean Distance is calculated as the square root of the sum of the squares
        // of the differences in x and y coordinates.
        return Math.sqrt(Math.pow(cell1.x - cell2.x, 2) + Math.pow(cell1.y - cell2.y, 2));
    }

    drawPath(context, size) {
      for (let i = 0; i < this.path.length; i++) {
        context.fillStyle = 'rgba(0, 255, 0, 0.3)';
        context.fillRect(this.path[i].x * size, this.path[i].y * size, size, size);
      }
    }

    playMove(
        pathIdx = 0, playerIndex = 0, 
        context, size, strokeColor, 
        onGoalReached = (player, timestamp)=>{}, 
        drawPath=false, drawPlayerPath=true
    ) {
        let move = this.path[pathIdx];
        let player = this.maze.players[playerIndex];
        let dx = move.x - player.cell.x;
        let dy = move.y - player.cell.y;
        this.maze.movePlayer({ dx, dy }, playerIndex);
        this.maze.draw(context, size, strokeColor,drawPlayerPath);
        if(drawPath) this.drawPath(context, size);

        if (pathIdx === this.path.length-1 && onGoalReached) {
            onGoalReached();
        }
    }

    playMoves(
        interval = 1000, playerIndex = 0, 
        context, size, strokeColor, 
        onGoalReached = (player, timestamp)=>{}, 
        drawPath=false, drawPlayerPath=true
    ) {
        let i = 0;
        let moves = this.path;

        this.interval = setInterval(() => {
            if (i < moves.length) {
                this.playMove(i, playerIndex, context, size, strokeColor, onGoalReached, drawPath,drawPlayerPath)
                i++;
            } else {
                clearInterval(this.interval);
            }
        }, interval);
    }

    stopMoves() {
        if(this.interval) clearInterval(this.interval);
    }

    //we can step the a* solver and visualize the progress 
    drawAStarProgress = (context, size, strokeStyle) => {
        context.clearRect(0,0,context.canvas.width,context.canvas.height);
        for (let y = 0; y < this.maze.height; y++) {
            for (let x = 0; x < this.maze.width; x++) {
                const cell = this.maze.cells[y][x];
                
                // If the cell has g and f values, use them to create a gradient
                if (typeof cell.g !== 'undefined' && cell.g > 0 && typeof cell.f !== 'undefined' && this.maxF > 0) {
                    // Normalize the f value using a power scale for better differentiation
                    // Adjust the exponent based on desired sensitivity (e.g., 0.5 for square root scaling)
                    const exponent = 0.999; // Can be adjusted for more or less sensitivity
                    const normalizedCost = Math.pow(cell.f / this.maxF, exponent);

                    // Adjust hue value based on the normalized cost
                    const hue = normalizedCost * (440); // Range from 120 (green) to 240 (blue)
                    // Adjust opacity based on the normalized cost
                    const opacity = Math.min(1, normalizedCost+0.1); // Ensuring opacity is at most 1

                    // Use HSLA for coloring
                    context.fillStyle = `hsla(${hue}, 100%, 50%, ${opacity})`;
                    context.fillRect(cell.x * size, cell.y * size, size, size);
                }
    
                // Draw cell walls and other features
                cell.draw(
                    context, 
                    size, 
                    strokeStyle,
                    this.maze.allowDiagonal,
                    this.maze.drawFiddleHeads, 
                    this.maze.seed
                );
            }
        }
    }

    //run solver as normal but delay steps so we can animate the decision boundaries
    runAStarProgressAnimation = (
        context, size, strokeStyle, stepDelayMs=100, 
        startX = this.maze.start.x, 
        startY = this.maze.start.y,
        endX = this.maze.end.x,
        endY = this.maze.end.y,
        allowDiagonal = this.maze.allowDiagonal, 
        rules, maxWaitTicks
    ) => {
        let start = this.maze.cells[startY][startX];
        let end = this.maze.cells[endY][endX];
        
        //if(start === this.start && end === this.end && this.path.length > 0) return this.path; //just return existing path instead of solving again
        
        this.reset();
    
        this.start = start;
        this.end = end;
        this.initializeCell(this.start);
    
        const openSet = this.openSet;
        const closedSet = this.closedSet;
        openSet.push(this.start, this.start.f);
    
        this.waitTicks = 0;
        this.waits = {};

        this.animating = true;
        return new Promise((res,rej) => {
            const step = () => {
                if(this.animating) {
                    const result = this.stepSolver(openSet, closedSet, allowDiagonal, rules, maxWaitTicks);
                    this.drawAStarProgress(context, size, strokeStyle);
                    if(result && result !== true) {
                        this.animating = false;
                        res(this.path);
                    } 
                    else {
                        if(stepDelayMs) this.timeout = setTimeout(()=>{this.animation = requestAnimationFrame(step)}, stepDelayMs)
                        else this.animation = requestAnimationFrame(step);
                    }
                } 
                else res(this.reconstructPath(this.openSet.pop()));
            }
            this.animation = requestAnimationFrame(step);
        });
    }

}

class PriorityQueue { //w/ binary heap structure

    constructor() {
        this.elements = [];
        this.elementIndices = {}; // Hash table to keep track of elements' indices in the heap
    }

    forEach(cb) {
        this.elements.forEach(cb);
    }

    push(element, priority) {
        const node = { element, priority };
        let ind = this.elements.length;
        this.elements.push(node);
        this.elementIndices[element.id] = ind; // Update index in hash table
        this.bubbleUp(ind);
    }

    pop() {
        if (this.elements.length === 0) {
            return undefined;
        }

        const poppedNode = this.elements[0].element;
        const endNode = this.elements.pop();

        if (this.elements.length !== 0) {
            this.elements[0] = endNode;
            this.elementIndices[endNode.element.id] = 0;
            delete this.elementIndices[poppedNode.id];
            this.sinkDown(0);
        } else {
            delete this.elementIndices[poppedNode.id];
        }

        return poppedNode;
    }

    update(element, newPriority) {
        if (element.id in this.elementIndices) {
            const index = this.elementIndices[element.id];
            if (this.elements[index].priority !== newPriority) {
                this.elements[index].priority = newPriority;
                this.bubbleUp(index);
                this.sinkDown(index);
            }
        }
    }
    
    reset() {
        this.elements = [];
        this.elementIndices = {};
    }

    isEmpty() {
        return this.elements.length === 0;
    }

    bubbleUp(n) {
        const node = this.elements[n];
        let parentN;

        while (n > 0) {
            parentN = (n - 1) >> 1;
            const parent = this.elements[parentN];

            if (node.priority >= parent.priority) break;

            this.elements[n] = parent;
            this.elementIndices[parent.element.id] = n;
            n = parentN;
        }

        this.elements[n] = node;
        this.elementIndices[node.element.id] = n;
    }

    sinkDown(n) {
        const length = this.elements.length;
        const node = this.elements[n];
        let childN;

        while (true) {
            let swap = null;
            childN = (n + 1) << 1;
            const leftChildN = childN - 1;

            if (leftChildN < length && this.elements[leftChildN].priority < node.priority) {
                swap = leftChildN;
            }

            if (childN < length && this.elements[childN].priority < (swap === null ? node.priority : this.elements[swap].priority)) {
                swap = childN;
            }

            if (swap === null) break;

            this.elements[n] = this.elements[swap];
            this.elementIndices[this.elements[swap].element.id] = n;
            n = swap;
        }

        this.elements[n] = node;
        this.elementIndices[node.element.id] = n;
    }
}

//iterative deepening A* which is basically a depth-first + heuristic approach so it balances out memory for stepping larger groups of AI. You can set memory limits which will impair the AI while decreasing overhead
export class IDAStarSolver {
    maze;
    starts = {};
    ends = {};
    paths = {};
    searched = {};
    searchedCtrs = {};
    bufferQueue = {};
    thresholds = {};
    currentVisits = {}; // Current number of visited nodes
    maxF = 0;


    constructor(
        maze
    ) {
        this.maze = maze;
    }

    //todo: not optimal and might not completely terminate
    async solveMultiple(
        goals, //goals = { agent1:{startX,startY,endX,endY,rules:{cannotOccupySameCell:true,arbitrary:(maze, current, neighbor, f, g, currentWaitTicks)=>{if(condition) return false;}}}}
        allowDiagonal = false, 
        maxWaitTicks = 20,
        onGoalReached=(
            key, 
            path, 
            goal, 
            searched, 
            unfinishedGoals, 
            occupiedCells, 
            previouslyOccupiedCells
        )=>{},  //return true to abort the solver
        onStep=(
            goals, 
            searched, 
            unfinishedGoals, 
            occupiedCells, 
            previouslyOccupiedCells
        )=>{},                   //return true to abort the solver
        maxNodeVisits = this.maze.width*this.maze.height,
        delay=0 //msdelay each time step
    ) {
        this.reset();

        let starts = {};
        let ends = {};
        let unfinishedKeys = Object.keys(goals);
        let unfinishedGoals = Object.values(goals);
        let agentHasAvoidanceRule = false;
        let waitTicks = {};
        let waits = {};
        let previouslyOccupiedCells = new Set();
        let occupiedCells = new Set();

        for (const key in goals) {
            starts[key] = this.maze.cells[goals[key].startY][goals[key].startX];
            ends[key] = this.maze.cells[goals[key].endY][goals[key].endX];
            this.paths[key] = [];
            this.starts[key] = starts[key];
            this.ends[key] = ends[key];
            this.searched[key] = {};
            this.searchedCtrs[key] = 0
            this.currentVisits[key] = 0;

            if (goals[key].rules && goals[key].rules.cannotOccupySameCell) {
                agentHasAvoidanceRule = true;
            }
            waitTicks[key] = 0;
            waits[key] = {};

            this.thresholds[key] = this.heuristic(this.starts[key], this.ends[key]);
            this.searched[key][starts[key].id] = { node: starts[key], g: 0, f: this.thresholds[key], previous: null };
            // Buffer queue to keep track of the order of nodes
            this.bufferQueue[key] = [starts[key].id];

            let startPosId = `${key}-${goals[key].startX}-${goals[key].startY}`;
            occupiedCells.add(startPosId);
        }

        let allEmpty = false;
        let currentSets = {};
        let iterate = () => {

            let abort;
            for (const key of unfinishedKeys) {
                let waitLapsed = false;
                let thresholdIncreased = false;

                if (this.currentVisits[key] < maxNodeVisits) {
                    let [found, nextThreshold, lastNode, openSet] = this.iterativeSearch(
                        goals[key].currentNode ? goals[key].currentNode : this.starts[key], 
                        this.ends[key], 
                        allowDiagonal, 
                        this.thresholds[key], 
                        key, 
                        goals[key].rules, 
                        occupiedCells, 
                        previouslyOccupiedCells, 
                        waitTicks[key],
                        currentSets[key]
                    );
                    this.currentVisits[key]++;

                    if(lastNode) goals[key].currentNode = lastNode;
                    currentSets[key] = openSet;
                    //console.log(openSet.size);
                    if (nextThreshold !== Infinity && nextThreshold >= this.thresholds[key]) {
                        this.thresholds[key] = nextThreshold;
                        thresholdIncreased = true;
                        waitTicks[key]=0;
                    }

                    if (found || this.currentVisits[key] > maxNodeVisits) {
                        this.paths[key] = this.reconstructPath(lastNode, waits[key]);
                        unfinishedKeys.splice(unfinishedKeys.indexOf(key), 1);
                        unfinishedGoals.splice(unfinishedGoals.indexOf(key), 1);
                        //console.log('goalreached');
                        if(onGoalReached) {
                            abort = onGoalReached(
                                key, 
                                this.paths[key], 
                                goals[key], 
                                this.searched[key], 
                                unfinishedGoals, 
                                occupiedCells, 
                                previouslyOccupiedCells
                            );
                            if(abort) break;
                        }
                    } else if (openSet.size === 0) {
                        if (waitTicks[key] < maxWaitTicks) {
                            waitTicks[key]++;
                            if (!waits[key][lastNode.id]) waits[key][lastNode.id] = 0;
                            waits[key][lastNode.id]++;
                        } else {
                            //console.log('waitLapsed');
                            waitLapsed = true; // Max waitTicks reached, stop this agent
                        }
                    } else

                    if (lastNode) {
                        let lastNodeId = `${key}-${lastNode.x}-${lastNode.y}`;
                        occupiedCells.add(lastNodeId);
                    }
                }

                if (waitLapsed) {
                    this.paths[key] = this.reconstructPath(goals[key].currentNode, waits[key]);
                    unfinishedKeys.splice(unfinishedKeys.indexOf(key), 1);
                    unfinishedGoals.splice(unfinishedGoals.indexOf(key), 1);
                }

            }

            allEmpty = unfinishedKeys.length === 0;

            if(onStep && !abort) {
                if(onStep) {
                    abort = onStep(
                        goals, 
                        this.searched, 
                        unfinishedGoals, 
                        occupiedCells, 
                        previouslyOccupiedCells
                    );
                    if(abort) {
                        allEmpty = true;
                    }
                }
            }
            
            if (agentHasAvoidanceRule) {
                previouslyOccupiedCells = new Set([...occupiedCells]);
                occupiedCells.clear();
            }

            if(!allEmpty && !abort) {
                if(delay) {
                    return new Promise((res) => {
                        setTimeout(async ()=>{
                            let result = await iterate();
                            res(result);
                        },delay);
                    })
                }
                return iterate();
            } else {
                return this.paths;
            }
        }
        
        return iterate();
    }

    iterativeSearch(
        start, 
        end, 
        allowDiagonal, 
        threshold, 
        key, 
        rules, 
        occupiedCells, 
        previouslyOccupiedCells, 
        currentWaitTicks, 
        openSet = new Set([start])
    ) {
        if(openSet.size === 0) {
            openSet = new Set([start]);
        }
        let nextThreshold = Infinity;
        let lastNode = null;
    
        //while (openSet.size > 0) {
        // Find the node with the lowest f value
        let currentNode = this.findNodeWithLowestF(openSet, this.searched[key]);

        if (currentNode === end) {
            return [true, threshold, currentNode, openSet]; // Path found
        }

        openSet.delete(currentNode);
        let neighborsAdded = false;
        for (const neighbor of this.maze.getReachableNeighbors(currentNode, allowDiagonal)) {
            if((rules && !this.applyRules(this.maze, rules, currentNode, neighbor, currentNode.f, currentNode.g, currentWaitTicks, occupiedCells, previouslyOccupiedCells, key)))
                { continue; }
            if (!this.searched[key][neighbor.id]) {
                this.searched[key][neighbor.id] = { node: neighbor, g:0, f:Infinity, previous: null };
                openSet.add(neighbor); neighborsAdded = true;
                let g = this.searched[key][currentNode.id].g + 1;
                let f = g + (allowDiagonal ? this.heuristicDiag(neighbor, end) : this.heuristic(neighbor, end));

                if(f > this.maxF) this.maxF = f;
                if (f <= threshold) {
                    this.searched[key][neighbor.id] = { node: neighbor, g, f, previous: currentNode };
                } else {
                    nextThreshold = Math.min(nextThreshold, f);
                }
                
            }
        }

        
        if (!neighborsAdded && openSet.size === 0) {
            this.backtrackToLastNodeWithUnexploredNeighbors(currentNode, openSet, this.searched[key], this.maze, allowDiagonal, rules, occupiedCells, previouslyOccupiedCells, threshold, key);
        }

        lastNode = currentNode;
        this.manageMemory(this.searched[key], this.bufferQueue[key], this.searchedCtrs[key], rules?.memoryLimit || 100);
        //}
        
        return [false, nextThreshold, lastNode, openSet]; // No path found within threshold
    }

    applyRules(maze, rules, current, neighbor, f, g, currentWaitTicks, occupiedCells, previouslyOccupiedCells, key) {
        for (const rule in rules) {
            if (typeof rules[rule] === 'function') {
                if (!rules[rule](maze, current, neighbor, f, g, currentWaitTicks)) return false;
            } else if (rule === 'cannotOccupySameCell') {
                let neighborId = `${key}-${neighbor.x}-${neighbor.y}`;
                if (occupiedCells.has(neighborId) || previouslyOccupiedCells.has(neighborId)) {
                    return false;
                }
            } else if (rule === 'keys') {
                if(neighbor.doors || current.doors) {
                    let direction = maze.getDirection(current,neighbor);
                    let opposite = maze.getOppositeDirection(direction);
                    if(current.doors?.[direction] || neighbor.doors?.[opposite]) {
                        if(current.doors?.[direction] != false || neighbor.doors?.[opposite] != false) { //if door is not false or undefined
                            if(!((current.doors?.[direction] && rules?.keys?.[current.doors[direction]]) ||
                                (neighbor.doors?.[opposite] && rules?.keys?.[neighbor.doors[direction]]))) {
                                    return false; //if the rules object passed does not contain a key for the corresponding door
                            } //this neighbor is not accessible if door is in way with no key
                        } 
                    }
                }
            }
        }

        return true;
    }

    findNodeWithLowestF(openSet, searched) {
        return [...openSet].reduce((minNode, node) => {
            return searched[node.id].f < searched[minNode.id].f ? node : minNode;
        }, openSet.values().next().value);
    }

    reconstructPath(end, waits) {
        let current = end;
        let path = [];
        while (current) {
            path.push(current);
            if(waits?.[current.id]) { for(let i = 0; i < waits[current.id]; i++) { path.push(current); }}
            current = current.previous;
        }
        return path.reverse();
    }

    heuristic(node1, node2) {
        return Math.abs(node1.x - node2.x) + Math.abs(node1.y - node2.y); //manhatten
    }

    //we can allow for diagonal movements like this
    heuristicDiag(cell1, cell2) {
        // The Euclidean Distance is calculated as the square root of the sum of the squares
        // of the differences in x and y coordinates.
        return Math.sqrt(Math.pow(cell1.x - cell2.x, 2) + Math.pow(cell1.y - cell2.y, 2));
    }

    reset() {
        this.searched = {};
        this.starts = {};
        this.ends = {};
        this.paths = {};
        this.searched = {}
        this.searchedCtrs = {};
        this.bufferQueue = {};
        this.thresholds = {};
    }

    manageMemory(searched, bufferQueue, searchedCtrs, memoryLimit) {
        if (searchedCtrs > memoryLimit) {
            const oldestNode = bufferQueue.shift();
            delete searched[oldestNode];
            searchedCtrs--;
        }
    }

    backtrackToLastNodeWithUnexploredNeighbors(currentNode, openSet, searched, maze, allowDiagonal, rules, occupiedCells, previouslyOccupiedCells, threshold, key) {
        let backtrackNode = currentNode.previous;
        while (backtrackNode) {
            if (this.hasUnexploredNeighbors(backtrackNode, searched, maze, allowDiagonal, rules, occupiedCells, previouslyOccupiedCells, threshold, key)) {
                openSet.add(backtrackNode);
                return; // Backtrack to this node
            }
            backtrackNode = backtrackNode.previous;
        }
    }

    hasUnexploredNeighbors(node, searched, maze, allowDiagonal, rules, occupiedCells, previouslyOccupiedCells, threshold, key) {
        return maze.getReachableNeighbors(node, allowDiagonal).some(neighbor => {
            if (searched[neighbor.id]) return false;
            let g = searched[node.id].g + 1;
            let f = g + (allowDiagonal ? this.heuristicDiag(neighbor, maze.ends[key]) : this.heuristic(neighbor, maze.ends[key]));
            return f <= threshold && (!rules || this.applyRules(maze, rules, node, neighbor, f, g, 0, occupiedCells, previouslyOccupiedCells));
        });
    }

}

