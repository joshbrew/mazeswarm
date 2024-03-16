
//more efficient implementation
export class FlowField {

    constructor(options) {
        this.init(options);
    }

    init(options) {

        if(options.maze) {
            this.width = options.maze.width*7;
            this.height = options.maze.height*7;

        } else if(options.width) {
            this.width = options.width;
            this.height = options.height;
        }

        // Basic initialization from options
        this.allowDiagonal = options.allowDiagonal ?? false;
        this.avoidObstacles = options.avoidObstacles ?? true;
        this.speedModifier = options.speedModifier ?? 0.3;
        this.maxValue = options.maxValue ?? Infinity;
        this.avoidance = options.avoidance ?? 1.5;
        this.avoidanceDampen = options.avoidanceDampen ?? 0.5;


        // Initialize fields as typed arrays for performance
        const totalSize = this.width * this.height;
        this.costField = options.costField ?? new Float32Array(totalSize); // Assuming 1 as default cost
        this.integrationField = new Float32Array(totalSize).fill(this.maxValue);
        this.flowFieldX = new Float32Array(totalSize).fill(0); // X component of flow direction
        this.flowFieldY = new Float32Array(totalSize).fill(0); // Y component of flow direction
        this.neighborCache = [];

        if(options.maze) {
            this.setMazeTerrain(options.maze);
        } else if (options.costRules) {
            this.applyCostRules(options.costRules);
        } 
            
    }

    index(x, y) {
        return y * this.width + x;
    }

    setCost(x, y, cost) {
        this.costField[this.index(x, y)] = cost;
    }

    getCost(x, y) {
        return this.costField[this.index(x, y)];
    }

    // Fills in the missing functionality to match the original class implementation
    applyCostRules(costRules) {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const idx = this.index(x, y);
                const terrainType = this.costField[idx]; // Assuming terrainType can be derived from costField
                if (terrainType in costRules) {
                    this.costField[idx] = costRules[terrainType];
                } else {
                    this.costField[idx] = this.maxValue; // Default to impassable if no rule exists
                }
            }
        }
    }

    //set costfield and reset integration and flowfields
    setCostField(
        field, 
        width, 
        height, 
        allowDiagonal
    ) {
        if(width) this.width = width;
        if(height) this.height = height;
        if(allowDiagonal) this.allowDiagonal = allowDiagonal;
        this.costField = field;
        this.integrationField = new Float32Array(totalSize).fill(this.maxValue);
        this.flowFieldX = new Float32Array(totalSize).fill(0); // X component of flow direction
        this.flowFieldY = new Float32Array(totalSize).fill(0); // Y component of flow direction
        this.neighborCache = [];
    }
    
    setMazeTerrain = (maze) => {
        // Loop through each MazeCell and update the corresponding 7x7 grid
        for (let y = 0; y < maze.height; y++) {
            for (let x = 0; x < maze.width; x++) {
                this.setCostFieldMazeCell(x, y, maze.cells[y][x], maze);
            }
        }

        return this.costField;
    }


    setCostFieldMazeCell(x, y, mazeCell, maze) {
        // Define the 7x7 subgrid for each MazeCell
        const baseX = x * 7;
        const baseY = y * 7;

        // Set costs for the entire 7x7 grid
        for (let i = 0; i < 7; i++) {
            for (let j = 0; j < 7; j++) {
                // The corners and edges are walls if allowDiagonals is true
                let cost = this.calculateCostForMazePosition(i, j, mazeCell, maze);
                this.setCost(baseX + i, baseY + j, cost);
            }
        }
    }

    calculateCostForMazePosition(i, j, mazeCell, maze) {
        // Passable inner 5x5 grid (center)
         if (i >= 1  && i <= 5 && j >= 1 && j <= 5) {
             if (this.allowDiagonal) { 
                 if(
                     (i === 1 && j === 1 && mazeCell.walls.upLeft && mazeCell.walls.up && mazeCell.walls.left) ||
                     (i === 5 && j === 1 && mazeCell.walls.upRight && mazeCell.walls.up && mazeCell.walls.right) ||
                     (i === 1 && j === 5 && mazeCell.walls.downLeft && mazeCell.walls.down && mazeCell.walls.left) ||
                     (i === 5 && j === 5 && mazeCell.walls.downRight && mazeCell.walls.down && mazeCell.walls.right)
                 ) {
                     return this.maxValue;
                 }
 
             }
             return 1;
         }
 
         // Handle orthogonal walls: make the 2x3 section for up/down/left/right walls impassable if true
         // Top wall (3x2)
         if (!mazeCell.walls.up && (j <= 1) && (i >= 1 && i <= 5)) return 1;
         // Bottom wall (3x2)
         if (!mazeCell.walls.down && (j >= 5) && (i >= 1 && i <= 5)) return 1;
         // Left wall (2x3)
         if (!mazeCell.walls.left && (i <= 1) && (j >= 1 && j <= 5)) return 1;
         // Right wall (2x3)
         if (!mazeCell.walls.right && (i >= 5) && (j >= 1 && j <= 5)) return 1;
 
     
         // Diagonal walls when diagonals are allowed
         if (this.allowDiagonal) {
             // upLeft correction and additional diagonals
             // Assuming 'mazeCell.walls.upLeft' being false means the wall is open.
             if (!mazeCell.walls.upLeft && ((i <= 2 && j <= 2) || (j === 2 && i <= 2) || (i === 2 && j <= 2))) return 1; // Corrected condition for upLeft
             if (!mazeCell.walls.upRight && ((i >= 4 && j <= 2) || (j === 2 && i >= 4) || (i === 4 && j <= 2))) return 1; // upRight passage
             if (!mazeCell.walls.downLeft && ((i <= 2 && j >= 4) || (j === 4 && i <= 2) || (i === 2 && j >= 4))) return 1; // downLeft passage
             if (!mazeCell.walls.downRight && ((i >= 4 && j >= 4) || (j === 4 && i >= 4) || (i === 4 && j >= 4))) return 1; // downRight passage
         
             if( i === 0 && j === 0 && (maze.getNeighbor(mazeCell,'left')?.walls.upRight === false || maze.getNeighbor(mazeCell,'up')?.walls.downLeft === false)) return 1;
             if( i === 0 && j === 6 && (maze.getNeighbor(mazeCell,'left')?.walls.downRight === false || maze.getNeighbor(mazeCell,'down')?.walls.upLeft === false)) return 1;
             if( i === 6 && j === 0 && (maze.getNeighbor(mazeCell,'right')?.walls.upLeft === false || maze.getNeighbor(mazeCell,'up')?.walls.downRight === false)) return 1;
             if( i === 6 && j === 6 && (maze.getNeighbor(mazeCell,'right')?.walls.downLeft === false || maze.getNeighbor(mazeCell,'down')?.walls.upRight === false)) return 1;
 
         }
     
         // All other cells are passable
         return this.maxValue;
    }

    setFlowDirection(x, y, dx, dy) {
        const idx = this.index(x, y);
        this.flowFieldX[idx] = dx;
        this.flowFieldY[idx] = dy;
    }

    getFlowDirection(x, y) {
        const idx = this.index(x, y);
        return { x: this.flowFieldX[idx], y: this.flowFieldY[idx] };
    }

    isWithinBounds(x, y) {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    getNeighbors(x, y) {
        const idx = this.index(x, y);
        // Check if the neighbors for this cell are already calculated
        let neighbors = this.neighborCache[idx];
        if (!neighbors) {
            // If not, calculate and store them
            const indices = [];
            const directions = this.allowDiagonal ? this.directionsOct : this.directions;
            directions.forEach(({ dx, dy }) => {
                const nx = x + dx, ny = y + dy;
                if (this.isWithinBounds(nx, ny)) {
                    indices.push(this.index(nx, ny));
                }
            });
            this.neighborCache[idx] = indices;
            neighbors = indices;
        }
        // Return the cached neighbors
        return neighbors;
    }

    updateField(goalX, goalY) {
        //console.time('flowfield');
        // Reset fields before recalculating
        this.integrationField.fill(this.maxValue);
        this.flowFieldX.fill(0);
        this.flowFieldY.fill(0);

        // Validate goal coordinates and update fields
        if (!this.isWithinBounds(goalX, goalY)) {
            console.error('Goal coordinates are out of bounds');
            return;
        }

        this.calculateIntegrationField(goalX, goalY);
        this.calculateFlowField();
        this.convolveFlowField(); // Optional: if you need to smooth the directions
    
        //console.timeEnd('flowfield');
    }

    idxToXY(idx) {
        return [idx % this.width, Math.floor(idx / this.width)];
    }

    calculateIntegrationField(goalX, goalY) {
        this.integrationField.fill(this.maxValue);
        const goalIdx = this.index(Math.floor(goalX), Math.floor(goalY));
        this.integrationField[goalIdx] = 0;
        let queue = [goalIdx];
    
        while (queue.length > 0) {
            let currentIdx = queue.shift();
            let currentCost = this.integrationField[currentIdx];
            let x = currentIdx % this.width
            let y = Math.floor(currentIdx / this.width);
    
            this.getNeighbors(x, y).forEach(nIdx => {
                let newCost = currentCost + this.costField[nIdx];
                if (newCost < this.integrationField[nIdx]) {
                    this.integrationField[nIdx] = newCost;
                    queue.push(nIdx);
                }
            });
        }
    }

    calculateFlowField() {
        for (let idx = 0; idx < this.integrationField.length; idx++) {
            //if (this.costField[idx] === this.maxValue) continue; // Skip impassable cells
    
            //idxToXY
            let x = idx % this.width;
            let y = Math.floor(idx / this.width);

            let lowestCost = this.maxValue;
            let bestDx = 0, bestDy = 0;
            let impassableDx = 0, impassableDy = 0;
            let hasImpassableNeighbor = false;
    
            this.getNeighbors(x, y).forEach(nIdx => {
                
                //idxToXY
                let nx = nIdx % this.width;
                let ny = Math.floor(nIdx / this.width);

                let neighborCost = this.integrationField[nIdx];
                let isImpassable = this.costField[nIdx] === this.maxValue;
    
                if (neighborCost < lowestCost) {
                    lowestCost = neighborCost;
                    bestDx = nx - x;
                    bestDy = ny - y;
                }
    
                if (isImpassable) {
                    hasImpassableNeighbor = true;
                    impassableDx += nx - x;
                    impassableDy += ny - y;
                }
            });
    
            //adjustDirectionAwayFromImpassable
            if (hasImpassableNeighbor && this.avoidObstacles && (impassableDx !== 0 || impassableDy !== 0)) {
                let adjustedDx = bestDx * this.avoidanceDampen - impassableDx;
                let adjustedDy = bestDy * this.avoidanceDampen - impassableDy;
            
                let magnitude = Math.sqrt(adjustedDx * adjustedDx + adjustedDy * adjustedDy);
                if (magnitude > 0) {
                    bestDx = (adjustedDx / magnitude) * this.avoidance;
                    bestDy = (adjustedDy / magnitude) * this.avoidance;
                }
            }
    
            this.flowFieldX[idx] = bestDx;
            this.flowFieldY[idx] = bestDy;
        }
    }

    adjustDirectionAwayFromImpassable(dx, dy, impassableDx, impassableDy) {
        let adjustedDx = dx * this.avoidanceDampen - impassableDx;
        let adjustedDy = dy * this.avoidanceDampen - impassableDy;
    
        let magnitude = Math.sqrt(adjustedDx * adjustedDx + adjustedDy * adjustedDy);
        if (magnitude > 0) {
            adjustedDx = (adjustedDx / magnitude) * this.avoidance;
            adjustedDy = (adjustedDy / magnitude) * this.avoidance;
        }
    
        return [adjustedDx, adjustedDy];
    }

    convolveFlowField() {
        // Convolution to smooth out the flow field directions
        // This example does not perform actual convolution but demonstrates the approach

        let newFlowFieldX = new Float32Array(this.width * this.height);
        let newFlowFieldY = new Float32Array(this.width * this.height);

        // Simple averaging for smoothing, replace with actual convolution as needed
        for (let y = 1; y < this.height - 1; y++) {
            for (let x = 1; x < this.width - 1; x++) {
                let idx = this.index(x, y);
                newFlowFieldX[idx] = (this.flowFieldX[idx] + this.flowFieldX[this.index(x + 1, y)] + this.flowFieldX[this.index(x - 1, y)]) / 3;
                newFlowFieldY[idx] = (this.flowFieldY[idx] + this.flowFieldY[this.index(x, y + 1)] + this.flowFieldY[this.index(x, y - 1)]) / 3;
            }
        }

        this.flowFieldX = newFlowFieldX;
        this.flowFieldY = newFlowFieldY;
    }

      // Helper static properties for directions
    directions = [
        {dx: -1, dy: 0}, {dx: 1, dy: 0},
        {dx: 0, dy: -1}, {dx: 0, dy: 1}
    ]
    directionsOct = [
        {dx: -1, dy: 0}, {dx: 1, dy: 0},
        {dx: 0, dy: -1}, {dx: 0, dy: 1},
        {dx: -1, dy: -1}, {dx: 1, dy: -1},
        {dx: -1, dy: 1}, {dx: 1, dy: 1}
    ]


    toggleVisualizationMode() {
        const modes = ['costField', 'integrationField', 'flowField'];
        const currentModeIndex = modes.indexOf(this.visualizationMode);
        const nextModeIndex = (currentModeIndex + 1) % modes.length;
        this.visualizationMode = modes[nextModeIndex];
    }

    visualize = (canvas) => {
        if(!this.visualizationMode) this.visualizationMode = 'flowField'; // Default visualization mode
        const ctx = canvas.getContext('2d');
        const cellSize = canvas.width / this.width;
        this.initializeDots(100);
        const animate = () => {
            // Clear previous visualization
            ctx.clearRect(0, 0, canvas.width, canvas.height);
    
            // Draw each cell
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    this.drawCell(ctx, x, y, cellSize, this.visualizationMode);
                }
            }
    
            // Update and draw dots
            this.updateDots();
            this.drawDots(ctx, cellSize);
    
            requestAnimationFrame(animate);
        };
    
        animate();

        // Add click event listener to canvas for recalculating flow field
        canvas.onclick = (event) => this.handleClick(event, canvas, cellSize);
    }

    handleClick(event, canvas, cellSize) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const mouseX = (event.clientX - rect.left) * scaleX;
        const mouseY = (event.clientY - rect.top) * scaleY;
        const gridX = Math.floor(mouseX / cellSize);
        const gridY = Math.floor(mouseY / cellSize);
        this.dots.forEach(dot => {dot.isSettled = false; dot.setGoal(gridX, gridY);});
        this.updateField(gridX, gridY);
        //this.visualize(canvas);
    }

    drawCell(ctx, x, y, cellSize, mode) {
        switch (mode) {
            case 'costField':
                this.drawCostFieldCell(ctx, x, y, cellSize);
                break;
            case 'integrationField':
                this.drawIntegrationFieldCell(ctx, x, y, cellSize);
                break;
            case 'flowField':
                this.drawFlowFieldCell(ctx, x, y, cellSize);
                break;
        }
    }

    drawCostFieldCell = (ctx, x, y, cellSize) => {
        const cost = this.getCost(x,y);
        ctx.fillStyle = this.getCostFieldColor(cost);
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize); // Optional: Draw cell border
    }

    drawIntegrationFieldCell = (ctx, x, y, cellSize) => {
        const integrationValue = this.integrationField[y][x];
        ctx.fillStyle = this.getIntegrationFieldColor(integrationValue);
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize); // Optional: Draw cell border
        this.drawText(ctx, integrationValue, x * cellSize, y * cellSize, cellSize);
    }

    drawFlowFieldCell = (ctx, x, y, cellSize) => {
        const cost = this.getCost(x,y);
        const direction = this.getFlowDirection(x,y);
    
        // Set cell color based on cost
        ctx.fillStyle = this.getCostFieldColor(cost);
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    
        // Draw arrow if there is a direction
        if (direction) {
            this.drawArrow(ctx, x, y, cellSize, direction);
        }
    }
    
    getCostFieldColor(cost) {
        if (cost === this.maxValue) {
            return 'gray'; // Impassable terrain
        } else {
            // Vary the color based on the cost. Adjust the color scheme as needed.
            const greenIntensity = 255 - Math.min(cost * 50, 255);
            return `rgb(0, ${greenIntensity}, ${255 - greenIntensity})`; // Darker green for higher costs
        }
    }

    getIntegrationFieldColor(value) {
        if (value === this.maxValue) return 'gray'; // Impassable
        const intensity = Math.min(1, value / 100);
        return `rgba(0, 0, 255, ${intensity})`; // Scale the blue color based on integration value
    }

    drawText(ctx, text, x, y, cellSize) {
        ctx.fillStyle = 'black';
        ctx.font = `${cellSize / 4}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text.toString(), x + cellSize / 2, y + cellSize / 2);
    }

    drawArrow(ctx, x, y, cellSize, direction) {
        const startX = x * cellSize + cellSize / 2;
        const startY = y * cellSize + cellSize / 2;
        const endX = startX + direction.x * cellSize / 2;
        const endY = startY + direction.y * cellSize / 2;
    
        // Line
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = 'rgba(0,0,255,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
    
        // Arrowhead
        // const angle = Math.atan2(endY - startY, endX - startX);
        // const headLength = cellSize / 4; // Customize length of the arrow head
        // ctx.beginPath();
        // ctx.moveTo(endX, endY);
        // ctx.lineTo(endX - headLength * Math.cos(angle - Math.PI / 6), endY - headLength * Math.sin(angle - Math.PI / 6));
        // ctx.lineTo(endX - headLength * Math.cos(angle + Math.PI / 6), endY - headLength * Math.sin(angle + Math.PI / 6));
        // ctx.lineTo(endX, endY);
        // ctx.lineTo(endX - headLength * Math.cos(angle - Math.PI / 6), endY - headLength * Math.sin(angle - Math.PI / 6));
        // ctx.strokeStyle = 'black';
        // ctx.lineWidth = 2;
        // ctx.stroke();
        // ctx.fillStyle = 'black';
        // ctx.fill();
    }

    dots = [];

    initializeDots(numberOfDots) {
        this.dots = [];
        for (let i = 0; i < numberOfDots; i++) {
            const x = Math.floor(Math.random() * this.width);
            const y = Math.floor(Math.random() * this.height);
            const dot = new Dot(x, y, this.speedModifier, undefined, this.maxValue);
            this.dots.push(dot);
            dot.teleportToNearestPassableCell(this.costField,this.width,this.height);
        }
    }

    updateDots() {
        const collisionRadius = 0.5; // Radius for checking collisions
        const goalRadius = 2.0; // Radius for settling near the goal
    
        // Update each dot based on the flow field, collision avoidance, and settling logic
        this.dots.forEach(dot => {
            if (!dot.isSettled) {
                // Update dot based on the flow field
                dot.update(this);
    
                // Check for collisions with impassable terrain and resolve them
                dot.ensureBoundsAndAvoidImpassable(this.costField, this.width, this.height);
    
                // Check for settling near the goal
                dot.checkSettle(this.dots, collisionRadius, goalRadius);
            }
        });
    
        // Handle collisions between dots
        for (let i = 0; i < this.dots.length; i++) {
            for (let j = i + 1; j < this.dots.length; j++) {
                const dot1 = this.dots[i];
                const dot2 = this.dots[j];
    
                if (dot1.collidesWith(dot2, collisionRadius)) {
                    dot1.resolveElasticCollision(dot2);
    
                    // After resolving the collision, recheck the positions to ensure they are not in impassable terrain
                    dot1.ensureBoundsAndAvoidImpassable(this.costField, this.width, this.height);
                    dot2.ensureBoundsAndAvoidImpassable(this.costField, this.width, this.height);
                }
            }
        }
    }

    drawDots(ctx, cellSize) {
        this.dots.forEach(dot => dot.draw(ctx, cellSize));
    }


}




class Dot {
    constructor(x, y, speed = 0.3, mass = 1, maxValue=Infinity) {
        this.x = x;
        this.y = y;
        this.baseSpeed = speed;
        this.vx = 0;
        this.vy = 0;
        this.mass = mass;
        this.isSettled = false;
        this.maxValue = maxValue;
    }

    
    // New method to set the goal coordinates
    setGoal(goalX, goalY) {
        this.goalX = goalX;
        this.goalY = goalY;
    }

    index(x, y, width) {
        return y * width + x;
    }

    // New method to check if the dot should settle
    checkSettle(dots, settleRadius, goalRadius) {
        if (this.isSettled) return; // Skip already settled dots

        // Check if dot is close to the goal
        const distanceToGoal = this.distanceTo(this.goalX, this.goalY);
        if (distanceToGoal > goalRadius) return; // Only settle near the goal

        // Check proximity to other dots
        const closeDots = dots.filter(dot => this !== dot && this.distanceTo(dot.x, dot.y) < settleRadius);
        if (closeDots.length > 0) {
            this.isSettled = true;
        }
    }

    distanceTo(x, y) {
        const dx = this.x - x;
        const dy = this.y - y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    collidesWith(otherDot, collisionRadius = 0.5) {
        return this.distanceTo(otherDot.x, otherDot.y) < collisionRadius;
    }

    ensureBoundsAndAvoidImpassable(costField, fieldWidth, fieldHeight) {
        // Ensure the dot is within bounds
        this.x = Math.max(0, Math.min(this.x, fieldWidth - 1));
        this.y = Math.max(0, Math.min(this.y, fieldHeight - 1));

        const cellX = Math.floor(this.x);
        const cellY = Math.floor(this.y);

        // Handle elastic collision with impassable walls
        if (costField[this.index(cellX,cellY,fieldWidth)] === this.maxValue) {
            this.handleElasticCollisionWithWall();
        }
    }

    handleElasticCollisionWithWall() {
        // Elastic collision logic: Invert the velocity components
        this.vx = -this.vx;
        this.vy = -this.vy;

        // Optionally, you can add a slight bounce-back effect
        this.x += this.vx;
        this.y += this.vy;
    }

    teleportToNearestPassableCell(costField, fieldWidth, fieldHeight) {
        // Search for the nearest passable cell
        for (let radius = 1; radius < Math.max(fieldWidth, fieldHeight); radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const newX = Math.floor(this.x) + dx;
                    const newY = Math.floor(this.y) + dy;
                    if (newX >= 0 && newY >= 0 && newX < fieldWidth && newY < fieldHeight) {
                        if (costField[this.index(newX,newY,fieldWidth)] !== this.maxValue) {
                            //console.log('teleporting')
                            this.x = newX;
                            this.y = newY;
                            return;
                        }
                    }
                }
            }
        }
    }

    update(flowField) {
        if (!this.isSettled) {
            const cellX = Math.floor(this.x);
            const cellY = Math.floor(this.y);
            const direction = flowField.getFlowDirection(cellX, cellY);
            const cost = flowField.getCost(cellX, cellY);

            if (direction && cost !== this.maxValue) {
                const speed = this.baseSpeed / cost;
                this.vx = direction.x * speed;
                this.vy = direction.y * speed;
            }

            this.x += this.vx;
            this.y += this.vy;

            this.ensureBoundsAndAvoidImpassable(flowField.costField, flowField.width, flowField.height);
        }
    }

    draw(ctx, cellSize) {
        ctx.beginPath();
        ctx.arc(this.x * cellSize, this.y * cellSize, cellSize / 4, 0, 2 * Math.PI);
        ctx.fillStyle = 'red';
        ctx.fill();
    }

    
    // Resolves elastic collision between two dots
    resolveElasticCollision(dot2) {
        // Calculate the vector from dot1 to dot2
        const dx = dot2.x - this.x;
        const dy = dot2.y - this.y;
        
        // Calculate distance between dots
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance == 0) return; // Prevent division by zero

        // Normalize the collision vector
        const nx = dx / distance;
        const ny = dy / distance;

        // Calculate relative velocity
        const vx = this.vx - dot2.vx;
        const vy = this.vy - dot2.vy;

        // Calculate relative velocity in terms of the normal direction
        const velocityAlongNormal = nx * vx + ny * vy;

        // Do not resolve if velocities are separating
        if (velocityAlongNormal > 0) return;

        // Calculate restitution (elasticity) - set to 1 for a perfectly elastic collision
        const restitution = 1;

        // Calculate impulse scalar
        const impulse = -(1 + restitution) * velocityAlongNormal / (1 / this.mass + 1 / dot2.mass);

        // Apply impulse to the velocities of dot1 and dot2
        this.vx -= impulse * nx / this.mass;
        this.vy -= impulse * ny / this.mass;
        dot2.vx += impulse * nx / dot2.mass;
        dot2.vy += impulse * ny / dot2.mass;

        // Separate the dots slightly to prevent sticking
        const overlap = distance / 2;
        this.x -= overlap * nx;
        this.y -= overlap * ny;
        dot2.x += overlap * nx;
        dot2.y += overlap * ny;
    }
}