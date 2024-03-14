import {AStarSolver} from './astar'


// A simple seedable random number generator
class SeededRandom {
    constructor(seed) {
        if(!seed) seed = Date.now()*0.0001;
        this.randF = seed;
        this.initialSeed = seed;
        this.e = Math.E;
    }

    set(seed) {
        this.randF = seed;
        this.initialSeed = seed;
    }
  
    reset() {
      this.randF = this.initialSeed;
    }
  
    random() {
      this.randF += this.e;
      const x = 1000000000*Math.sin(this.randF);
      return x - Math.floor(x);
    }
  }
  


export class Maze {

    seed = new SeededRandom(Date.now()*0.001);

    directions = {
        left: { dx: -1, dy: 0, wallDirection: 'left', opposite: 'right' }, 
        right: { dx: 1, dy: 0, wallDirection: 'right', opposite: 'left' },
        up: { dx: 0, dy: -1, wallDirection: 'up', opposite: 'down' },
        down: { dx: 0, dy: 1, wallDirection: 'down', opposite: 'up' }
    };

    //octagonal (diagonal) grid
    directionsOct = {
        up: { dx: 0, dy: -1, wallDirection: 'up', opposite: 'down' },
        upRight: { dx: 1, dy: -1, wallDirection: 'upRight', opposite: 'downLeft' },
        right: { dx: 1, dy: 0, wallDirection: 'right', opposite: 'left' },
        downRight: { dx: 1, dy: 1, wallDirection: 'downRight', opposite: 'upLeft' },
        down: { dx: 0, dy: 1, wallDirection: 'down', opposite: 'up' },
        downLeft: { dx: -1, dy: 1, wallDirection: 'downLeft', opposite: 'upRight' },
        left: { dx: -1, dy: 0, wallDirection: 'left', opposite: 'right' },
        upLeft: { dx: -1, dy: -1, wallDirection: 'upLeft', opposite: 'downRight' }
    }

    directionsKeys = Object.keys(this.directions)
    directionsOctKeys = Object.keys(this.directionsOct);

    width; height; generator; onWin;
    cells = [];
    players = {};

    usingDoors = false;
    doorCells = {};
    keyCells = {};
    doorOrder; maxCellsFromEnd; pathToDoor;

    visitedCells = {};// Rolling buffer to store the last 10 visited cells
    playerPathLength = 10; //e.g. store the last 10 visited cells

    drawFiddleHeads = false;

    allowDiagonal=false; //allow diagonal movement/generation
    
    //todo: cleanup
    constructor(
        width, 
        height, 
        generateMazeFunction, 
        onWin, 
        seed,
        allowDiagonal
    ) {
        if(height && width && generateMazeFunction) this.generateMaze(width, height, generateMazeFunction, onWin, seed, allowDiagonal);
    }

    generateMaze(width, height, generateMazeFunction, onWin, seed, allowDiagonal) {
        if(width) this.width = width;
        if(height) this.height = height;
        if(generateMazeFunction) this.generator = generateMazeFunction;
        if(onWin) this.onWin = onWin; // Store the win callback
        if(seed) {this.seed.set(seed);}
        if(allowDiagonal) this.allowDiagonal = allowDiagonal;
        console.time(`genMaze ${this.generator.name}`);

        if(this.cells.length > 0) { //hard reset
            this.cells.length = 0;
        }

        for (let y = 0; y < this.height; y++) {
            let row = [];
            for (let x = 0; x < this.width; x++) {
                row.push(new MazeCell(x, y, this));
            }
            this.cells.push(row);
        }

        let {
            startX, startY, endX, endY
        } = this.getRandomStartAndEnd();
        this.setStart(startX, startY);
        this.setEnd(endX, endY);

        if(Object.keys(this.players).length > 0) { //reset player positions
            for(const key in this.players) {
                this.visitedCells[key] = [];
                this.players[key].cell = this.start;
                
                this.recordVisit(this.players[key].cell, key);  // Record the cell visitation

            }
        }
  
        if (typeof this.generator === 'function') {
            this.generator(this, this.seed, this.allowDiagonal);
        }
        if(this.usingDoors) {
            this.addDoorsAndKeys(
                this.start,
                this.end,
                this.doorOrder,
                this.maxCellsFromEnd,
                allowDiagonal,
                this.pathToDoor,
                true
            );
        }
        console.timeEnd(`genMaze ${this.generator.name}`);
    }
 
    getDirection(fromCell, toCell) {
        if (toCell.x > fromCell.x) {
            if (toCell.y < fromCell.y) return 'upRight';
            else if (toCell.y > fromCell.y) return 'downRight';
            else return 'right';
        }
        else if (toCell.x < fromCell.x) {
            if (toCell.y < fromCell.y) return 'upLeft';
            else if (toCell.y > fromCell.y) return 'downLeft';
            else return 'left';
        }
        else {
            if (toCell.y < fromCell.y) return 'up';
            else if (toCell.y > fromCell.y) return 'down';
        }
    }  
    
    getDirectionKey(dx, dy) {
        for (const [key, value] of Object.entries(this.directionsOct)) {
            if (value.dx === dx && value.dy === dy) {
                return key;
            }
        }
        return null; // or throw an error if you prefer
    }

    getWallDirection(dx, dy) {
        // Translate directional changes into wall directions for orthogonal directions
        if (dx === 0 && dy === -1) return 'up';
        if (dx === 1 && dy === 0) return 'right';
        if (dx === 0 && dy === 1) return 'down';
        if (dx === -1 && dy === 0) return 'left';
    
        // Translate directional changes into wall directions for diagonal directions
        if (dx === 1 && dy === -1) return 'upRight';
        if (dx === 1 && dy === 1) return 'downRight';
        if (dx === -1 && dy === 1) return 'downLeft';
        if (dx === -1 && dy === -1) return 'upLeft';
    
        // Return null if the input doesn't match any known direction.
        // This can be a signal that something unexpected has occurred.
        return null;
    }

    getCell(x, y) {
        // Check if the coordinates are within the valid range
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            return this.cells[y][x];
        }
        // Return null if the coordinates are out of bounds
        return null;
    }

    //get maze data template
    getCellData() {
        let data = [];
        for(let i = 0; i < this.height; i++) {
            data.push([]);
            for(let j = 0; j < this.width; j++) {
                const cell = this.cells[i][j];

                data[i].push({
                    walls:cell.walls,
                    x:cell.x,
                    y:cell.y,
                    isStart:cell.isStart,
                    isEnd:cell.isEnd,
                    id:cell.id,
                    doors:cell.doors,
                    keys:cell.keys
                })
            }
        }
        return data;
    }

    //set maze data from template
    setCellData(data=[[]],allowDiagonal=false) {
        let cells = [];
        data.forEach((row,y) => {
            let r = [];
            row.forEach((celldata,x) => {
                let mazecell = new MazeCell(x,y,this);
                Object.assign(mazecell,celldata);
                r.push(mazecell);
                if(celldata.isStart) this.start = mazecell;
                if(celldata.isEnd) this.end = mazecell;
            });
            cells.push(r);
        });
        this.width = data[0].length;
        this.height = data.length;
        this.allowDiagonal = allowDiagonal
        this.cells = cells;
    }
      
    getNeighbors(cell, allowDiagonal=false) {
        const neighbors = []; 
        const keys = (allowDiagonal ? this.directionsOctKeys : this.directionsKeys);
        for (const direction of keys) {
            const neighbor = this.getNeighbor(cell, direction);
            if (neighbor) {
                neighbors.push(neighbor);
            }
        }
        return neighbors;
    }

    //get a neighbor in a specific direction, if any
    getNeighbor(cell, direction) {
        const x = cell.x;
        const y = cell.y;
        if(!this.directionsOct[direction]) return;
        const neighbor = this.getCell(
            x + this.directionsOct[direction].dx, 
            y + this.directionsOct[direction].dy
        );
        
        if (neighbor) {
            return neighbor;
        }
    }

    getUnvisitedNeighbors(cell, allowDiagonal=false) {
        return this.getNeighbors(cell, allowDiagonal).filter(neighbor => !neighbor.visited);
    }
    
    getVisitedNeighbors(cell, allowDiagonal=false) {
        return this.getNeighbors(cell, allowDiagonal).filter(neighbor => neighbor.visited);
    }

    getReachableNeighbors(cell, allowDiagonal=false) {
        const neighbors = [];
      
        // Iterate over all possible directions
        const keys = (allowDiagonal ? this.directionsOctKeys : this.directionsKeys);
        for (const direction of keys) {
            const { dx, dy, wallDirection, opposite } = this.directionsOct[direction];
            const x = cell.x + dx;
            const y = cell.y + dy;
      
            // Check boundary conditions
            if (x >= 0 && y >= 0 && x < this.width && y < this.height) {
                const potentialNeighbor = this.cells[y][x];
      
                // Check if there is no wall between the current cell and the potential neighbor
                if (!cell.walls[wallDirection] && !potentialNeighbor.walls[opposite]) {
                    neighbors.push(potentialNeighbor);
                }
            }
        }
        return neighbors;
    }

    getOppositeDirection(direction) {
        switch (direction) {
          case 'left': return 'right';
          case 'right': return 'left';
          case 'up': return 'down';
          case 'down': return 'up';
          case 'upRight': return 'downLeft';
          case 'downLeft': return 'upRight';
          case 'upLeft': return 'downRight';
          case 'downRight': return 'upLeft';
          default: return null;
        }
    }

    getAdjacentDirections(direction, allowDiagonal = false) {
        const cardinalDirections = {
            left: ['up', 'down'],
            right: ['up', 'down'],
            up: ['left', 'right'],
            down: ['left', 'right']
        };
    
        const diagonalDirections = {
            left: ['upLeft', 'downLeft'],
            right: ['upRight', 'downRight'],
            up: ['upLeft', 'upRight'],
            down: ['downLeft', 'downRight'],
            upRight: ['right', 'up'],
            downRight: ['right', 'down'],
            upLeft: ['left', 'up'],
            downLeft: ['left', 'down']
        };
    
        if (allowDiagonal) {
            // Return adjacent diagonal directions based on the input direction
            return diagonalDirections[direction] || [];
        } else {
            // Return adjacent cardinal directions based on the input direction
            return cardinalDirections[direction] || [];
        }
    }

    // Method to set the starting point of the maze
    setStart(x, y) {
        this.start = this.getCell(x, y);
        this.start.setStart();
    }

    // Method to set the ending point of the maze
    setEnd(x, y) {
        this.end = this.getCell(x, y);
        this.end.setEnd();
    }

    //connect all neighbors
    connectNeighbors(cell, direction, allowDiagonal=false) {
        if (direction) {
            let neighbor = this.getNeighbor(cell, direction);
            if (neighbor) cell.connect(neighbor);
        } else {
            this.getNeighbors(cell, allowDiagonal).forEach(neighbor => cell.connect(neighbor));
        }
    }

    //connect all neighbors
    disconnectNeighbors(cell, direction, allowDiagonal) {
        if (direction) {
            let neighbor = this.getNeighbor(cell, direction);
            if (neighbor) cell.disconnect(neighbor);
        } else {
            this.getNeighbors(cell, allowDiagonal).forEach(neighbor => cell.disconnect(neighbor));
        }
    }

    // Method to reset the maze
    // todo: reset keys and doors
    reset = (newGoal=true) => {
        this.won = false;  // Reset the won flag
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                this.cells[y][x].reset();
            }
        }
        if(newGoal) {
            let {
                startX, startY, endX, endY
            } = this.getRandomStartAndEnd();
            this.setStart(startX, startY);
            this.setEnd(endX, endY);
            for(const key in this.players) {
                this.visitedCells[key] = [];
                this.setPlayer(this.start.x, this.start.y, key);
            }
            // if(this.usingDoors) { //error for some reason
            //     this.addDoorsAndKeys(
            //         this.start,
            //         this.end,
            //         this.doorOrder, 
            //         this.maxCellsFromEnd, 
            //         this.allowDiagonal, 
            //         this.pathToDoor, 
            //         true
            //     );
            // }
        }
    }

   
    //set start/end posts along different edges. Doesn't guarantee they aren't nearby.
    getRandomStartAndEnd() {
        // Set a random starting point
        const startEdge = Math.floor(this.seed.random() * 4); // 0: up, 1: right, 2: down, 3: left
        let startX, startY;
        if (startEdge === 0) { // up
            startX = Math.floor(this.seed.random() * this.width);
            startY = 0;
        } else if (startEdge === 1) { // right
            startX = this.width - 1;
            startY = Math.floor(this.seed.random() * this.height);
        } else if (startEdge === 2) { // down
            startX = Math.floor(this.seed.random() * this.width);
            startY = this.height - 1;
        } else { // left
            startX = 0;
            startY = Math.floor(this.seed.random() * this.height);
        }

        
        // Set a random ending point on a different edge
        
        // Select a different end edge from the start edge
        let endEdge = (startEdge + 2) % 4; // This ensures opposite edge, remove this logic if you want a random different edge but not opposite
       
        // Select a different end edge from the start edge
        //let possibleEndEdges = [0, 1, 2, 3].filter(e => e !== startEdge);
        //let endEdge = possibleEndEdges[Math.floor(this.seed.random() * possibleEndEdges.length)];
        
        // Calculate a safe range for end positions to avoid being too close to start
        let safeEndRanges = {
            x: [0, this.width - 1],
            y: [0, this.height - 1]
        };
        // Adjust the safe range based on startEdge to enforce distance
        if (startEdge === 0 || startEdge === 2) {
            // Adjust horizontal range to avoid being too close
            safeEndRanges.x = [Math.max(0, startX - 2), Math.min(this.width - 1, startX + 2)];
        } else {
            // Adjust vertical range to avoid being too close
            safeEndRanges.y = [Math.max(0, startY - 2), Math.min(this.height - 1, startY + 2)];
        }


        let endX, endY;
        // Assign end position based on endEdge, ensuring it's not too close to the start
        if (endEdge === 0) { // up
            endX = Math.floor(this.seed.random() * (safeEndRanges.x[1] - safeEndRanges.x[0])) + safeEndRanges.x[0];
            endY = 0;
        } else if (endEdge === 1) { // right
            endX = this.width - 1;
            endY = Math.floor(this.seed.random() * (safeEndRanges.y[1] - safeEndRanges.y[0])) + safeEndRanges.y[0];
        } else if (endEdge === 2) { // down
            endX = Math.floor(this.seed.random() * (safeEndRanges.x[1] - safeEndRanges.x[0])) + safeEndRanges.x[0];
            endY = this.height - 1;
        } else { // left
            endX = 0;
            endY = Math.floor(this.seed.random() * (safeEndRanges.y[1] - safeEndRanges.y[0])) + safeEndRanges.y[0];
        }

        return {
            startX, startY, endX, endY
        }
    }

    connect(cell1, cell2, neighbors=true) {
        cell1.connect(cell2, neighbors);
    }

    disconnect(cell1, cell2, neighbors=true) {
        cell1.disconnect(cell2, neighbors);
    }

    //removes any 3 or 4-sided cells
    removeDeadEnds = (fromCenter=false, allowDiagonal) => { //fromCenter will create a spiral pattern and remove center cells

        if(fromCenter) {
            // Find the center of the maze
            const centerX = Math.floor(this.cells[0].length / 2);
            const centerY = Math.floor(this.cells.length / 2);

            // Calculate the maximum distance from the center to any corner
            const maxDistance = Math.max(centerX, this.cells[0].length - centerX - 1, centerY, this.cells.length - centerY - 1);


            // Initialize a connected set that contains the coordinates of the central cell(s)
            let connected = new Set();

            if (this.cells.length % 2 === 0 && this.cells[0].length % 2 === 0) {
                // Even dimensions: add the center 4 cells coordinates as strings "x,y"
                connected.add(`${centerX},${centerY}`);
                connected.add(`${centerX-1},${centerY}`);
                connected.add(`${centerX},${centerY-1}`);
                connected.add(`${centerX-1},${centerY-1}`);
            } else {
                // Odd dimensions: add the central cell coordinates as a string "x,y"
                connected.add(`${centerX},${centerY}`);
            }

            // Spiral coordinates generator
            function* spiral(xCenter, yCenter, maxDist) { //generator function
                yield [xCenter, yCenter];
                for (let layer = 1; layer <= maxDist; layer++) {
                    let x = xCenter + layer;
                    let y = yCenter - layer;
                    for (; y <= yCenter + layer; y++) yield [x, y];
                    for (x -= 1, y -= 1; x >= xCenter - layer; x--) yield [x, y];
                    for (x += 1, y -= 1; y >= yCenter - layer; y--) yield [x, y];
                    for (x += 1, y += 1; x <= xCenter + layer; x++) yield [x, y];
                }
            }

            // Iterate over the cells in a spiral pattern from the center
            for (let [x, y] of spiral(centerX, centerY, maxDistance)) {
                // Ensure x and y are within bounds
                if (x >= 0 && x < this.cells[0].length && y >= 0 && y < this.cells.length) {
                    const cell = this.cells[y][x];
                    if (cell.isDeadEnd(allowDiagonal)) {
                        let neighbors = this.getVisitedNeighbors(cell, allowDiagonal);
                        if(neighbors.length < 1) neighbors = this.getUnvisitedNeighbors(cell, allowDiagonal);
                        // Randomly select a neighbor to connect to and remove the wall
                        // Filter neighbors to ensure they keep the path to the center
                        neighbors = neighbors.filter(neighbor => {
                            const key = `${neighbor.x},${neighbor.y}`;
                            return connected.has(key) || neighbors.some(n => connected.has(`${n.x},${n.y}`));
                        });

                        if (neighbors.length > 0) {
                            // Connect to one of the neighbors that maintains the path to the center
                            const neighbor = neighbors[Math.floor(Math.random() * neighbors.length)];
                            this.connect(cell, neighbor);
                            // Add the new cell to the connected set
                            connected.add(`${x},${y}`);
                        }
                    }
                }
            }

            // Connect the center cells
            if (this.cells.length % 2 === 0 && this.cells[0].length % 2 === 0) {
                // Even dimensions: connect the center 4 cells
                const centers = [
                [centerX, centerY],
                [centerX - 1, centerY],
                [centerX, centerY - 1],
                [centerX - 1, centerY - 1]
                ];
                centers.forEach(([x, y]) => {
                    this.cells[y][x].visited = true;
                    this.getNeighbors(this.cells[y][x], allowDiagonal).forEach(neighbor => {
                        this.connect(this.cells[y][x], neighbor);
                    });
                });
            } else {
                // Odd dimensions: make sure the central cell is connected
                const centerCell = this.cells[centerY][centerX];
                centerCell.visited = true;
                this.getNeighbors(centerCell, allowDiagonal).forEach(neighbor => {
                    this.connect(centerCell, neighbor);
                });
            }
        }
        else {
            this.cells.forEach(row => {
                row.forEach((cell) => {
                    if (cell.isDeadEnd(allowDiagonal)) {
                        let neighbors = this.getVisitedNeighbors(cell, allowDiagonal);
                        if(neighbors.length < 1) neighbors = this.getUnvisitedNeighbors(cell, allowDiagonal);
                        // Randomly select a neighbor to connect to and remove the wall
                        const neighbor = neighbors[Math.floor(Math.random() * neighbors.length)];
                        this.connect(cell, neighbor);
                    }
                });
            });
        }
    };

    // Method to add a new player to the maze
    addPlayer(
        x=this.start.x, 
        y=this.start.y, 
        color={r:155*Math.random(),g:155*Math.random(),b:155*Math.random()}, 
        playerIndex
    ) {
        if(typeof playerIndex === 'undefined') playerIndex = Object.keys(this.players).length;
        const playerCell = this.getCell(x, y);
        this.players[playerIndex] = { cell: playerCell, color, keys:{} };  // Store the player along with their color
        this.visitedCells[playerIndex] = [];  // Initialize visitedCells for the new player

        this.recordVisit(playerCell, playerIndex);  // Record the cell visitation

        // Check for win condition for the new player
        this.checkWin();

        return this.players[playerIndex];
    }

    // Method to set the player's current position
    setPlayer(x, y, playerIndex, color) {
        if(typeof playerIndex === 'undefined' || !this.players[playerIndex]) {
            this.addPlayer(x, y, color, playerIndex);
            if(typeof playerIndex === 'undefined') playerIndex = Object.keys(this.players).length - 1;
        }
        if (this.players[playerIndex]) {
            if(color) this.players[playerIndex].color = color;
        }
        this.players[playerIndex].cell = this.getCell(x, y);
        this.recordVisit(this.players[playerIndex].cell, playerIndex);  // Record the cell visitation

        // Check for win condition
        this.checkWin();
    }

    removePlayer(playerIndex=0) {
        delete this.players[playerIndex];
    } 

    movePlayer(direction, playerIndex, onCollision = (player, wallDirection, playerIndex) => {
        console.log("There's a wall in the way!", player, wallDirection, playerIndex)
    }) {
        const { dx, dy } = typeof direction === 'object' ? direction : this.directionsOct[direction]; //input {dx,dy} or "up"/"down"/"left"/"right"
        const player = this.players[playerIndex];
        const currentCell = player.cell;
        const newX = currentCell.x + dx;
        const newY = currentCell.y + dy;
      
        // Check for walls in the direction of movement
        const wallDirection = this.getWallDirection(dx, dy);
        const opposite = this.getOppositeDirection(wallDirection);
        let adjacent = this.getNeighbor(currentCell, wallDirection);
        const door = currentCell.doors?.[wallDirection] || adjacent?.doors?.[opposite];
        if (currentCell.walls[wallDirection] || (door && !player.keys?.[door])) {
            if (onCollision) onCollision(player, wallDirection, playerIndex);
            return;
        }
        //if((door && player.keys?.[door])) console.log('player has key', door);
      
        // If there are no walls, update the player's position
        const newCell = this.getCell(newX, newY);
        if (newCell) {
            player.cell = newCell;
            this.recordVisit(newCell, playerIndex);  // Record the cell visitation
            if(newCell.keys) {
                if(!player.keys) player.keys = {};
                Object.assign(player.keys,newCell.keys);
                //console.log('Player has keys:', player.keys);

                Object.keys(newCell.keys).forEach(color => {
                    // Check if all players have this key
                    const allPlayersHaveKey = Object.keys(this.players).every(p => {
                        const plr = this.players[p];
                        if (!plr.keys) {
                            plr.keys = {}; // Initialize keys object if it doesn't exist
                        }
                        // Check if the player has the key; assume presence is indicated by truthy value
                        return plr.keys[color];
                    });
            
                    // If all players have the key, clear it from the cell
                    if (allPlayersHaveKey) {
                        newCell.clearKey(color); // Assuming clearKey is a method that removes the key from the cell
                        this.doorCells[color].forEach((cell) => {
                            cell.clearDoor(undefined,color);
                        }); delete this.doorCells[color]; //clear doors too
                    }
                });

                this.handlePlayerHasKey(player, player.keys, newCell);
            }

            // Check for win condition
            this.checkWin();
        } else {
          console.log("Player is trying to move outside of the maze boundaries!");
        }
    }

    checkWin() {
        if (this.won) return;  // Skip if the game has already been won
        
        for(const key in this.players) {
            let player = this.players[key];
            
            if (player.cell === this.end) {
                this.won = true;  // Set the won flag
                if (typeof this.onWin === 'function') this.onWin(player);
                this.handleWin();
            }
        }
    }

    handlePlayerHasKey(player, key, cell) {
        console.log("Player", player, "picked up key" , key, cell)
    }

    // Default win behavior, call in onWin if you want to retain it
    handleWin() {
        // Perform any necessary actions after a player wins, such as showing a victory message
        // ...
        
        // Reset the game for the next round (default behavior)
        this.reset();
        
    }


    recordVisit(cell, playerIndex) {
        const now = Date.now();
        cell.visitedTimestamp = now;
    
        this.visitedCells[playerIndex].push({ cell, timestamp: now });
        if (this.visitedCells[playerIndex].length > this.playerPathLength) {
            this.visitedCells[playerIndex].shift();
        }
    }

    draw(context, size, strokeStyle='blue', drawPlayerPaths=true, clear=true, mirrorX=false, mirrorY=false) {

        if(clear) context.clearRect(0, 0, context.canvas.width, context.canvas.height);

        if(mirrorX || mirrorY) {
            if(mirrorX) {
                context.translate(context.canvas.width*-1,0);
            }
            if(mirrorY) {
                context.translate(0,context.canvas.height);
            }
            let x = mirrorX ? -1 : 1;
            let y = mirrorY ? -1 : 1;
            context.scale(x,y);
        }

        // Draw color trails first
        let lastSeed = this.seed.randF;
        this.seed.randF = this.seed.initialSeed;
        context.beginPath();
        let doorCells = [];
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const cell = this.cells[y][x];
                
                if(Object.keys(this.players) > 0) {

                    for (const playerIndex in this.players) {
                        const player = this.players[playerIndex];
                        if (drawPlayerPaths && this.visitedCells[playerIndex]) {
                            const visitedIndex = [...this.visitedCells[playerIndex]].reverse().findIndex(v => v.cell === cell);
                            if (visitedIndex !== -1 && cell !== player.currentCell) {
                                const alpha = cell === player.cell ? 1 : 0.6 - (this.visitedCells[playerIndex].length - (this.visitedCells[playerIndex].length - visitedIndex)) / this.visitedCells[playerIndex].length;
                                
                                //only use rgba strings or {r,g,b} objects
                                let col = typeof player.color === 'string' ? this.replaceAlphaInRgba(player.color, alpha) : `rgba(${player.color.r}, ${player.color.g}, ${player.color.b}, ${alpha})`;
                                context.fillStyle = col;
                                context.fillRect(cell.x * size, cell.y * size, size, size);
                            }
                        }
                        context.strokeStyle = strokeStyle;
                        cell.draw(
                            context, 
                            size, 
                            strokeStyle,
                            this.allowDiagonal,
                            this.drawFiddleHeads, 
                            this.seed,
                            true
                        );
                        if(cell.doors || cell.keys) doorCells.push(cell);
                    }
                } else {
                    cell.draw(
                        context, 
                        size, 
                        strokeStyle,
                        this.allowDiagonal,
                        this.drawFiddleHeads, 
                        this.seed,
                        true
                    );
                    if(cell.doors || cell.keys) doorCells.push(cell);
                }
            }
        }
        context.stroke(); //faster not to do it per-cell
        if(doorCells.length > 0) {
            doorCells.forEach((cell) => {
                cell.draw(
                    context, 
                    size, 
                    undefined,
                    this.allowDiagonal,
                    this.drawFiddleHeads, 
                    this.seed,
                    false,
                    true
                );
            })
        }

        this.seed.randF = lastSeed;
    }

    replaceAlphaInRgba(rgbaString, newAlpha) {
        // Ensure newAlpha is a number and is between 0 and 1
        newAlpha = Math.max(0, Math.min(1, parseFloat(newAlpha)));
        
        // Use a regular expression to match and replace the alpha value in the rgba string
        return rgbaString.replace(/rgba\((\d+),(\d+),(\d+),(\d*(?:\.\d+)?)\)/, `rgba($1,$2,$3,${newAlpha})`);
    }

    //generalized door solver, should work on multipath mazes too
    addDoorsAndKeys(start, end, doorOrder=['chartreuse'], maxCellsFromEnd=3, allowDiagonal=this.allowDiagonal, pathToDoor='last', clearPrev = true) {
        
        if(this.usingDoors && clearPrev) this.clearDoorsAndKeys();
        
        if(this.doorOrder) {
            this.doorOrder.push(...doorOrder);
        } else this.doorOrder = doorOrder;
        this.maxCellsFromEnd = maxCellsFromEnd;
        this.pathToDoor = pathToDoor;


        this.usingDoors = true;
        
        let solver = new AStarSolver(this);
       
        let doorCells = {}; //set doors after begin before end
        let keyCells = {}; //set keys after begin before corresponding doors 
        let doorPaths = {}; //path to the first or last door set
        let keyPaths = {}; //verify access to keys
        //add doors, then wall off those doors with more doors till those are all walled off, repeat

        let goal = end;
        let maxDistance = 0;
        let lastColor; let lastColorIdx = 0; //need to rotate thru all possible directions to block em off
       
        const setDoor = (path, color) => {
            if(path.length === 0) return false;
            let idx = Math.floor(2 + Math.random() * maxCellsFromEnd); //varying the door placement along the path to make it more interesting
            let dist = path.length - idx; 
            if(dist < 1) dist = path.length-1;
            let cell = path[dist - 1];
            let cell2 = path[dist];
            if(dist > maxDistance) maxDistance = dist;
            if (!cell || !cell2) return false;
            let d = this.getDirection(cell, cell2);
            cell.setDoor(d, color);
            if(allowDiagonal) {
                this.getAdjacentDirections(d, allowDiagonal).forEach((ad) => {
                    if(!cell.walls[ad] && !cell.doors[ad]) {
                        cell.setDoor(ad,color);
                    }
                })
            }
            doorCells[color] = doorCells[color] || [];
            if (doorCells[color][doorCells[color].length - 1] !== cell) {
                doorCells[color].push(cell);
            } else {
                return false;
            }
            return true;
        };

        let remainingDoors = [...doorOrder];

        outer:
        for(let i = doorOrder.length - 1; i >= 0; i--) {
            let color = doorOrder[i];
            
            remainingDoors.pop();

            solver.reset(); //reset solver
            let path = solver.solve(start.x, start.y, goal.x, goal.y, allowDiagonal, { keys: {} }); //if we do not posess a key of a color, doors act like walls
            if(path?.length < 1) throw new Error('unsolvable');
            doorPaths[color] = [...path]; //store first path to goal/door (probably least convoluted path)

            if (path[path.length - 1] === goal) {
                inner:
                while (true) {
                    
                    if (
                        path[path.length - 1] === goal && !setDoor(path, color) && 
                        (!lastColor || lastColorIdx === doorCells[lastColor].length - 1)
                    ) {
                        break inner;
                    }
    
                    let pathCpy = [...path]; // Copy path since solver will reuse array memory
                    solver.reset(); // Reset solver

                    //check after adding the door if the goal is still solvable
                    let newPath = solver.solve(start.x, start.y, goal.x, goal.y, allowDiagonal, { keys: {} });
    
                    //if goal now not solvable move onto next door in previous color list or break
                    if (newPath[newPath.length - 1] !== goal) {
                        setDoor(path, color);
                        // Check if there are remaining doors from the last color to block off
                        if (lastColor && lastColorIdx < doorCells[lastColor].length - 1) {
                            lastColorIdx++;
                            goal = doorCells[lastColor][lastColorIdx]; // Update goal to next door to block
                            //update path to new goal
                            newPath = solver.solve(start.x, start.y, goal.x, goal.y, allowDiagonal, { keys: {} });
                        } else {
                            lastColor = color;
                            lastColorIdx = 0; 
                            goal = doorCells[color][0]; //next goal should be first door in previous list
                            if (pathToDoor === 'last') {
                                doorPaths[color] = pathCpy; // Use the last path to the door (longest path)
                            }
                            break inner; // Exit the loop to move on to the next door color
                        }
                    }
    
                    //set next path to block off
                    path = newPath; 
                }
            }


            //lets place a key
            if(doorCells[color]?.length > 0) {
                if(pathToDoor === 'random') {
                    
                    let cell;
                    let setKey = () => {
                        let endCoords = (1+maxCellsFromEnd)*Object.keys(keyCells).length;
                        const canBeExcluded = (this.width > endCoords && this.height > endCoords);
                        if(canBeExcluded) {
                            // Define two exclusion zones
                            const exclusionZones = [
                                { x: start.x - endCoords, y: start.x - endCoords, width: 2*endCoords, height: 2*endCoords }, // First exclusion zone
                                { x: end.x - endCoords, y: end.x - endCoords, width: 2*endCoords, height: 2*endCoords }  // Second exclusion zone
                            ];
                            // Generate a random coordinate excluding the defined zones
                            const xy = genCoordsWithExclusionZones(this.width, this.height, exclusionZones);
                            cell = this.getCell(xy.x,xy.y);   
                        } else cell = doorPaths[color][0]; //just put it in the first cell available
        
                        
                        let keys = {};
                        remainingDoors.forEach((color) => {keys[color] = true})
                        keyPaths[color] = solver.solve(start.x,start.y,cell.x,cell.y,allowDiagonal, { keys });
                    }
                    setKey();
                    let k = 0;
                    //check if reachable
                    while(keyPaths[color][keyPaths[color].length - 1] !== keyCells[color] && k < 5) { //unreachable
                        setKey();
                        k++;
                    }
                    
                    if(k === 5 && keyPaths[color][keyPaths[color].length - 1] !== cell) {
                        keyCells[color] = this.start;
                        doorPaths[color][0].setKey(color)
                    } else if(cell) {
                        cell.setKey(color);
                        keyCells[color] = cell;
                    }

                } else if(doorPaths[color]) {
                    let cell;
                    let setKey = () => {
                        let min = 0; 
                        let max = Math.floor(maxDistance);
                        if(doorPaths[color].length > maxCellsFromEnd) {
                            min = maxCellsFromEnd;
                            max = doorPaths[color].length - maxCellsFromEnd;
                        }
                        //console.log(doorPaths[color])
                        let idx = Math.floor(Math.random()*(max-min)) + min;
                        if(!doorPaths[color][idx]) idx = 0;
                        
                        cell = doorPaths[color][idx];

                        let keys = {};
                        remainingDoors.forEach((color) => {keys[color] = true})
                        keyPaths[color] = solver.solve(start.x,start.y,cell.x,cell.y,allowDiagonal, { keys });
                
                    }
                    setKey();
                    let k = 0;
                    //check if reachable
                    while(keyPaths[color][keyPaths[color].length - 1] !== cell && k < 5) { //unreachable
                        setKey();
                        k++;
                    }
                    
                    if(k === 5 && keyPaths[color][keyPaths[color].length - 1] !== cell) {
                        keyCells[color] = this.start;
                        doorPaths[color][0].setKey(color)
                    } else if (cell) {
                        cell.setKey(color); //place a key on this random point in the path to the door
                        keyCells[color] = cell;
                    }
                } else {
                    console.warn("No path for", color);
                }
            } else {
                console.warn("No cells for",color);
            }
           
        }

        this.doorCells = this.doorCells ? Object.assign(this.doorCells,doorCells) : doorCells;
        this.keyCells = this.keyCells ? Object.assign(this.keyCells, keyCells) : keyCells;

        let result = {
            doors:doorCells,
            keys:keyCells,
            doorPaths,
            keyPaths
        };


        //now that we did the doors, lets do the keys
        return result; //all doors set successfully, now draw maze to see result
        
    }

    clearDoorsAndKeys(color=null) {
        if(this.doorCells) {
            Object.keys(this.doorCells).forEach((c) => {
                if(!color || c === color) 
                    this.doorCells[c].forEach((cell) => {
                        cell.clearDoor(undefined,c);
                        cell.clearKey(c);
                    });
            });
            delete this.doorCells;
        }
        if(this.keyCells) {
            Object.keys(this.keyCells).forEach((c) => {
                if(!color || c === color) 
                    this.keyCells[c].clearKey(c);
            });
            delete this.keyCells;
        }
        this.doorOrder = undefined;
        this.usingDoors = false;
    }

}

let wallKeys = ['up', 'right', 'down', 'left'];

let wallKeys3D = ['up', 'right', 'down', 'left', 'above', 'below'];

let wallKeysOct = ['up', 'right', 'down', 'left', 'upRight', 'upLeft', 'downRight', 'downLeft'];

let wallKeys3DOct = [
    'up', 'right', 'down', 'left', 
    'upRight', 'upLeft', 'downRight', 'downLeft', 
    'above', 'below',
    'aboveUp', 'aboveRight', 'aboveDown', 'aboveLeft', 
    'aboveUpRight', 'aboveUpLeft', 'aboveDownRight', 'aboveDownLeft', 
    'belowUp', 'belowRight', 'belowDown', 'belowLeft', 
    'belowUpRight', 'belowUpLeft', 'belowDownRight', 'belowDownLeft'
];

let walls3D = {
    // Original 2D octagonal directions
    up: true, right: true, down: true, left: true,
    upRight: true, upLeft: true, downRight: true, downLeft: true,

    // Vertical directions
    above: true, below: true,

    // Diagonal upwards in the plane directions
    aboveUp: true, aboveRight: true, aboveDown: true, aboveLeft: true,
    // Diagonal upwards with diagonal directions
    aboveUpRight: true, aboveUpLeft: true, aboveDownRight: true, aboveDownLeft: true,

    // Diagonal downwards in the plane directions
    belowUp: true, belowRight: true, belowDown: true, belowLeft: true,
    // Diagonal downwards with diagonal directions
    belowUpRight: true, belowUpLeft: true, belowDownRight: true, belowDownLeft: true
};

//object representation of a maze cell in an xy grid
export class MazeCell {
    walls = { up: true, right: true, down: true, left: true, upRight:true, upLeft:true, downRight:true, downLeft:true }; //octagonal coordinates
   
    x; y; 
    isStart; isEnd; 
    visited = false; // A flag to indicate whether this cell has been visited during maze generation
    id = Math.random();
      // All cells start with all walls intact
    
    //
    doors;
    keys;
    
    connections = {}; //more general connection structure
    maze;
    // Constructor to initialize a cell at (x, y) coordinates
    constructor(x, y, maze, threeDimensional=false) {
        // Storing the x and y coordinates
        this.x = x;
        this.y = y;
        this.maze = maze;

        if(threeDimensional) 
            Object.assign(this.walls, walls3D);
    }
  
    // Method to remove walls between this cell and another cell
    connect(cell, neighbors=true) {
        if(neighbors) { //assuming adjacency
            if (this.y === cell.y) {
                if (this.x > cell.x) {
                    this.walls.left = false;
                    cell.walls.right = false;
                } else if (this.x < cell.x) {
                    this.walls.right = false;
                    cell.walls.left = false;
                }
            } else if (this.x === cell.x) {
                if (this.y > cell.y) {
                    this.walls.up = false;
                    cell.walls.down = false;
                } else if (this.y < cell.y) {
                    this.walls.down = false;
                    cell.walls.up = false;
                }
            } else if (this.x < cell.x && this.y < cell.y) {
                this.walls.downRight = false;
                cell.walls.upLeft = false;
            } else if (this.x > cell.x && this.y < cell.y) {
                this.walls.downLeft = false;
                cell.walls.upRight = false;
            } else if (this.x < cell.x && this.y > cell.y) {
                this.walls.upRight = false;
                cell.walls.downLeft = false;
            } else if (this.x > cell.x && this.y > cell.y) {
                this.walls.upLeft = false;
                cell.walls.downRight = false;
            }
        } else { //abstract connections
            cell.connections[this.id] = true;
            this.connections[cell.id] = true;
        }
    
        this.visited = true;
        cell.visited = true;
    }
    
    // Method to add walls between this cell and another cell
    disconnect(cell, neighbors=true) {
        if(neighbors) { //assuming adjacency
            if (this.y === cell.y) {
                if (this.x > cell.x) {
                    this.walls.left = true;
                    cell.walls.right = true;
                } else if (this.x < cell.x) {
                    this.walls.right = true;
                    cell.walls.left = true;
                }
            } else if (this.x === cell.x) {
                if (this.y > cell.y) {
                    this.walls.up = true;
                    cell.walls.down = true;
                } else if (this.y < cell.y) {
                    this.walls.down = true;
                    cell.walls.up = true;
                }
            } else if (this.x < cell.x && this.y < cell.y) {
                this.walls.downRight = true;
                cell.walls.upLeft = true;
            } else if (this.x > cell.x && this.y < cell.y) {
                this.walls.downLeft = true;
                cell.walls.upRight = true;
            } else if (this.x < cell.x && this.y > cell.y) {
                this.walls.upRight = true;
                cell.walls.downLeft = true;
            } else if (this.x > cell.x && this.y > cell.y) {
                this.walls.upLeft = true;
                cell.walls.downRight = true;
            }
        } else { //abstract connections
            delete cell.connections[this.id];
            delete this.connections[cell.id];
        }
    
        this.visited = true;
        cell.visited = true;
    }

    hasAllWalls() {
        return this.walls.up && this.walls.right && this.walls.down && this.walls.left && this.walls.upRight && this.walls.downRight && this.walls.downLeft && this.walls.upLeft;
    }
  
    // Method to mark this cell as the starting point
    setStart() {
      this.isStart = true;
    }
  
    // Method to mark this cell as the ending point
    setEnd() {
      this.isEnd = true;
    }
  
    isDeadEnd(allowDiagonal) {
        if(allowDiagonal) {
            if(allowDiagonal === 2) wallKeys3D.filter(this.walls[k]).length > 8
            else if (allowDiagonal === 3) wallKeys3DOct.filter(this.walls[k]).length > 12; 
            return wallKeysOct.filter((k) => this.walls[k]).length > 6; //7 sides on an 8 sided cell
        }
        return wallKeys.filter((k) => this.walls[k]).length > 2; //3 or more sides on a 4 sided cell
    }

    setDoor = (direction, color='chartreuse') => {
        if(!this.doors) {
            this.doors = {};
        }
        if(direction) {
            if(this.walls[direction]) {
                this.walls[direction] = false; //replace wall with door if it is a wall
            }
            this.doors[direction] = color;
            return true;
        }
        else if(color) { //block all available directions
            Object.keys(this.walls).forEach((k) => {
                if(this.walls[k]) {
                    return;
                }
                if(this.doors[k] === color) this.doors[k] = color;
            });
            return true;
        }
        return false;
    }

    clearDoor = (direction,color) => {
        if(this.doors) {
            if(direction) {
                if(color) {
                    Object.keys(this.doors).forEach((k) => {
                        if(this.doors[k] === color) delete this.doors[direction];
                    });
                }
                delete this.doors[direction];
                return true;
            }
            else if(color) {
                Object.keys(this.doors).forEach((k) => {
                    if(this.doors[k] === color) delete this.doors[k];
                });
                return true;
            } else for (door in this.doors) {
                delete this.doors[door];
            }
        }
        return false;
    }

    setKey = (color) => { //this cell has keys
        if(!this.keys) {
            this.keys = {};
        }
        this.keys[color] = true;
    }

    clearKey = (color) => {
        if(this.keys?.[color]) delete this.keys[color];
        else if(this.keys) for (const key in this.keys) {
            delete this.keys[key];
        }
    }

    // Method to reset the cell's special states (start, end, path)
    reset = () => {
      this.isStart = false;
      this.isEnd = false;
      this.isPath = false;
    }

    drawSquareCell = (context, size, strokeStyle='blue', fiddleheads, seed, bulkDraw, drawDoorsAndKeys) => {
        
        if (this.isStart || this.isEnd) {
            context.fillStyle = this.isStart ? 'green' : this.isEnd ? 'red' : 'blue';
            context.fillRect(this.x * size, this.y * size, size, size);
        }

        if (drawDoorsAndKeys && this.keys) {
            const keys = Object.keys(this.keys); // Assuming this.keys is an object where keys are colors
            const numberOfKeys = keys.length;
            const gridSize = Math.ceil(Math.sqrt(numberOfKeys)); // Grid size to determine rows and columns
            const spacing = size / (gridSize + 1); // Spacing between circles
            
            for (let i = 0; i < numberOfKeys; i++) {
                const row = Math.floor(i / gridSize);
                const col = i % gridSize;
                const xPosition = this.x * size + (col + 1) * spacing;
                const yPosition = this.y * size + (row + 1) * spacing;
                const radius = size / (2 * gridSize); // Radius of the circles, adjust as necessary
        
                context.fillStyle = keys[i]; // Set fill color to key color
                context.beginPath();
                context.arc(xPosition, yPosition, radius, 0, 2 * Math.PI);
                context.fill();
            }
        }
  
        if(fiddleheads) { //just a joke feature
              if (this.walls.up) {
                  drawWallWithSpirals(context, size, this.x * size, this.y * size, (this.x + 1) * size, this.y * size, 'up', seed, strokeStyle);
              }
              if (this.walls.right) {
                  drawWallWithSpirals(context, size, (this.x + 1) * size, this.y * size, (this.x + 1) * size, (this.y + 1) * size, 'right', seed, strokeStyle);
              }
              if (this.walls.down) {
                  drawWallWithSpirals(context, size, (this.x + 1) * size, (this.y + 1) * size, this.x * size, (this.y + 1) * size, 'down', seed, strokeStyle);
              }
              if (this.walls.left) {
                  drawWallWithSpirals(context, size, this.x * size, (this.y + 1) * size, this.x * size, this.y * size, 'left', seed, strokeStyle);
              }
        } else {

            const drawWalls = (test=this.walls, strokeStyle) => {
              // Drawing the walls of the cell
                if(!bulkDraw) context.beginPath();
                else if(strokeStyle) context.strokeStyle = strokeStyle;

                if (test.up) {
                    if(typeof test.up === 'string') context.strokeStyle = test.up;
                    context.moveTo(this.x * size, this.y * size);
                    context.lineTo((this.x + 1) * size, this.y * size);
                }

                if (test.left) {
                    if(typeof test.left === 'string') context.strokeStyle = test.left;
                    context.moveTo(this.x * size, (this.y + 1) * size);
                    context.lineTo(this.x * size, this.y * size);
                }

                //more efficient not to redraw these 
                if(drawDoorsAndKeys || this.x === this.maze.width-1) {
                    if (test.right) {
                        if(typeof test.right === 'string') context.strokeStyle = test.right;
                        context.moveTo((this.x + 1) * size, this.y * size);
                        context.lineTo((this.x + 1) * size, (this.y + 1) * size);
                    }
                }
                if(drawDoorsAndKeys || this.y === this.maze.height - 1) {
                    if (test.down) {
                        if(typeof test.down === 'string') context.strokeStyle = test.down;
                        context.moveTo((this.x + 1) * size, (this.y + 1) * size);
                        context.lineTo(this.x * size, (this.y + 1) * size);
                    }
                }
              if(!bulkDraw) context.stroke();

            }
            
            if(!drawDoorsAndKeys) drawWalls(this.walls, strokeStyle);
            else if(this.doors) {
                //console.log('drawdoors',bulkDraw,this.doors)
                drawWalls(this.doors);
            }
          

        }

        
    }

    drawOctagonalCell(context, size, strokeStyle='blue', bulkDraw, drawDoorsAndKeys) {
        // Calculate diagonal offset for drawing diagonal walls
        const diagonalOffset = size / (2 * Math.sqrt(2)); // Half diagonal of a square of side 'size'
    
        // If the cell is marked as the start or end, fill it with a color
        if (this.isStart || this.isEnd) {
            context.fillStyle = this.isStart ? 'green' : this.isEnd ? 'red' : 'blue';
            context.fillRect(this.x * size, this.y * size, size, size);
        }

        
        if (drawDoorsAndKeys && this.keys) {
            const keys = Object.keys(this.keys); // Assuming this.keys is an object where keys are colors
            const numberOfKeys = keys.length;
            const gridSize = Math.ceil(Math.sqrt(numberOfKeys)); // Grid size to determine rows and columns
            const spacing = size / (gridSize + 1); // Spacing between circles
            
            for (let i = 0; i < numberOfKeys; i++) {
                const row = Math.floor(i / gridSize);
                const col = i % gridSize;
                const xPosition = this.x * size + (col + 1) * spacing;
                const yPosition = this.y * size + (row + 1) * spacing;
                const radius = size / (2 * (gridSize > 1 ? gridSize : 2)); // Radius of the circles, adjust as necessary
        
                context.fillStyle = keys[i]; // Set fill color to key color
                context.beginPath();
                context.arc(xPosition, yPosition, radius, 0, 2 * Math.PI);
                context.fill();
            }
        }


        const drawWalls = (test=this.walls, strokeStyle) => {
            if(!bulkDraw) context.beginPath();
            else if(strokeStyle) context.strokeStyle = strokeStyle;
        
            // Drawing orthogonal walls
            if (test.up) {
                if(typeof test.up === 'string') context.strokeStyle = test.up;
                context.moveTo(this.x * size + diagonalOffset, this.y * size);
                context.lineTo((this.x + 1) * size - diagonalOffset, this.y * size);
            }

            //more efficient to not draw repeatedly when drawing all cells
            if(drawDoorsAndKeys || this.x === this.maze.width-1) {
                if (test.right) {
                    if(typeof test.right === 'string') context.strokeStyle = test.right;
                    context.moveTo((this.x + 1) * size, this.y * size + diagonalOffset);
                    context.lineTo((this.x + 1) * size, (this.y + 1) * size - diagonalOffset);
                }
            }
            if(drawDoorsAndKeys || this.y === this.maze.height - 1) {
                if(test.down) {
                    if(typeof test.down === 'string') context.strokeStyle = test.down;
                    context.moveTo((this.x + 1) * size - diagonalOffset, (this.y + 1) * size);
                    context.lineTo(this.x * size + diagonalOffset, (this.y + 1) * size);
                }
            }

            if (test.left) {
                if(typeof test.left === 'string') context.strokeStyle = test.left;
                context.moveTo(this.x * size, (this.y + 1) * size - diagonalOffset);
                context.lineTo(this.x * size, this.y * size + diagonalOffset);
            }
        
            // Drawing diagonal walls
            if (test.upRight) {
                if(typeof test.upRight === 'string') context.strokeStyle = test.upRight;
                context.moveTo((this.x + 1) * size - diagonalOffset, this.y * size);
                context.lineTo((this.x + 1) * size, this.y * size + diagonalOffset);
            }
            if (test.downRight) {
                if(typeof test.downRight === 'string') context.trokeStyle = test.downRight;
                context.moveTo((this.x + 1) * size, (this.y + 1) * size - diagonalOffset);
                context.lineTo((this.x + 1) * size - diagonalOffset, (this.y + 1) * size);
            }
            if (test.downLeft) {
                if(typeof test.downLeft === 'string') context.strokeStyle = test.downLeft;
                context.moveTo(this.x * size + diagonalOffset, (this.y + 1) * size);
                context.lineTo(this.x * size, (this.y + 1) * size - diagonalOffset);
            }
            if (test.upLeft) {
                if(typeof test.upLeft === 'string') context.strokeStyle = test.upLeft;
                context.moveTo(this.x * size, this.y * size + diagonalOffset);
                context.lineTo(this.x * size + diagonalOffset, this.y * size);
            }
        
            if(!bulkDraw) context.stroke();
    
        }

        if(!drawDoorsAndKeys) drawWalls(this.walls, strokeStyle);
        else if(this.doors) {
            drawWalls(this.doors);
        }
    }

    // Method to draw the cell and its walls on a canvas context
    draw(
        context, 
        size, 
        strokeStyle='blue', 
        allowDiagonal=false, 
        fiddleheads = false, 
        seed, 
        bulkDraw=false, 
        drawDoorsAndKeys=false
    ) {
        // If the cell is marked as the start or end, fill it with a color

        if(allowDiagonal) {
            this.drawOctagonalCell(context, size, strokeStyle, bulkDraw, drawDoorsAndKeys);
        } else {
            this.drawSquareCell(context, size, strokeStyle, fiddleheads, seed, bulkDraw, drawDoorsAndKeys);
        }
    }
}

const randomNumSpirals = (seed) => Math.floor(seed.random() * 4) + 1; // Random number of spirals, between 1 and 6

// Function to draw spirals at each wall if it exists
function drawWallWithSpirals (context, size, fromX, fromY, toX, toY, direction, seed, strokeStyle) {
    context.strokeStyle = strokeStyle ? strokeStyle : 'blue'
    context.beginPath();
    context.moveTo(fromX, fromY);
    context.lineTo(toX, toY);
    context.stroke();
    

    let numSpirals = randomNumSpirals(seed);
    for (let i = 0; i < numSpirals; i++) {
        // Calculate a random position along the wall for the spiral
        let posAlongWall = seed.random();
        let spiralStartX = fromX + (toX - fromX) * posAlongWall;
        let spiralStartY = fromY + (toY - fromY) * posAlongWall;
        
        // Scale the size of the spiral to the wall size
        let spiralSize = size * 0.1; // Adjust the 0.1 to scale the spirals bigger or smaller
        let spiralTurns = 1; // Adjust the number of turns for the spiral
    
        drawSpiral(context, spiralStartX, spiralStartY, spiralSize, spiralTurns, direction, seed);
    }
};

function drawSpiral(context, startX, startY, size, turns, wallOrientation, seed, strokeStyle='green') {
    let initialRadius = (size+seed.random()-0.75) * 0.02; // Start with a small radius
    let radiusIncrement = (size+seed.random()-1) * 0.04; // Increment rate for the radius
    let angleIncrement = Math.PI / (turns * 12); // Base increment for the angle
    let totalTurns = turns * 12 * 6; // Total number of iterations for the spiral

    // Determine the starting angle based on the wall orientation
    let startAngle;
    let directionModifier = 1;
    switch (wallOrientation) {
        case 'up':
            startAngle = -Math.PI / 2;
            break;
        case 'right':
            startAngle = 0;
            break;
        case 'down':
            startAngle = Math.PI / 2;
            directionModifier = -1;
            break;
        case 'left':
            startAngle = Math.PI;
            directionModifier = -1;
            break;
        default:
            startAngle = 0; // Default to right direction if orientation is undefined
    }

    angleIncrement *= directionModifier;

    // Calculate the ending angle and radius
    let endAngle = startAngle + totalTurns * angleIncrement;
    let endRadius = initialRadius + totalTurns * radiusIncrement;

    // Offset position will be directly to the left of the ending position for a fiddlehead effect
    let offsetX = startX - endRadius * Math.cos(startAngle);
    let offsetY = startY - endRadius * Math.sin(startAngle);

    context.strokeStyle = strokeStyle;
    context.beginPath();

    // Adjust the angle to point towards the end position for the first segment
    let angle = startAngle; // Rotate the start angle by 90 degrees counter-clockwise
    let radius = initialRadius;

    // Move to the start of the spiral, not the end
    let initialX = offsetX + radius * Math.cos(angle);
    let initialY = offsetY + radius * Math.sin(angle);
    context.moveTo(initialX, initialY);

    for (let i = 0; i < totalTurns; i++) {
        // Increase the radius as we spiral out
        radius += radiusIncrement;
        // Add randomness to the angle increment
        angle += angleIncrement + (seed.random() - 0.5) * (angleIncrement * 0.2);

        let x = offsetX + radius * Math.cos(angle);
        let y = offsetY + radius * Math.sin(angle);
        context.lineTo(x, y);
    }

    context.lineWidth = 1;
    context.stroke();
}



function genCoordsWithExclusionZones(totalWidth, totalHeight, exclusionZones) {
    let x, y, isValid;
    while (!isValid) {
        x = Math.floor(Math.random() * totalWidth);
        y = Math.floor(Math.random() * totalHeight);
        isValid = true;
        for (let zone of exclusionZones) {
            if (x >= zone.x && x <= zone.x + zone.width &&
                y >= zone.y && y <= zone.y + zone.height) {
                isValid = false;
                break;
            }
        }
    } 
    return { x, y };
}

function isTooClose(startX, startY, endX, endY, startEdge, endEdge) {
    // Check if end position is within 2 cells of start position on adjacent edges
    if (startEdge === 0 && endEdge === 3 || startEdge === 3 && endEdge === 0) {
        // Top and Left edges are adjacent
        return Math.abs(startX - endX) < 3;
    } else if (startEdge === 1 && endEdge === 2 || startEdge === 2 && endEdge === 1) {
        // Right and Bottom edges are adjacent
        return Math.abs(startX - endX) < 3;
    } else if (startEdge === 0 && endEdge === 1 || startEdge === 1 && endEdge === 0) {
        // Top and Right edges are adjacent
        return Math.abs(startY - endY) < 3;
    } else if (startEdge === 2 && endEdge === 3 || startEdge === 3 && endEdge === 2) {
        // Bottom and Left edges are adjacent
        return Math.abs(startY - endY) < 3;
    }
    return false;
}
