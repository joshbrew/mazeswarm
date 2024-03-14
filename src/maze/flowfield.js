export class FlowField {

    width;
    height;
    allowDiagonal;
    costField;
    integrationField;
    flowField;

    maxValue = Infinity;
    avoidance=1.5; avoidanceDampen=0.5; avoidObstacles=true;
    speedModifier=0.3; //e.g. used for tick updates or as a multiplier effect on velocities (your choice)


    constructor(
        options
    ) {
        this.init(options);
    }

    init(options) {
        if(options.allowDiagonal) this.allowDiagonal = options.allowDiagonal;
        if(options.maze) {
            this.width = options.maze.width*7;
            this.height = options.maze.height*7;

        } else if(options.width) {
            this.width = options.width;
            this.height = options.height;
        }

        if(options.speedModifier) this.speedModifier = options.speedModifier;
        if(options.avoidObstacles) options.avoidObstacles = true;
        if(options.maxValue) this.maxValue = options.maxValue;
        if('avoidance' in options) this.avoidance = options.avoidance;
        if('avoidanceDampen' in options) this.avoidanceDampen = options.avoidanceDampen;
        if(options.costRules) this.costField = this.applyCostRules(options.costField, options.costRules);
        else this.costField = options.costField ? options.costField : options.maze ? this.setMazeTerrain(options.maze) : this.initializeGrid(1);
        
        this.integrationField = this.initializeGrid(this.maxValue);
        this.flowField = this.initializeGrid({ x:0, y:0 });
    }

    applyCostRules(costField, costRules) {
        let result = new Array(costField.length);
        for (let y = 0; y < costField.length; y++) {
            result[y] = new Array(costField[y].length);
            for (let x = 0; x < costField[y].length; x++) {
                const terrainType = costField[y][x];
                if (terrainType in costRules) {
                    // Apply the numerical cost based on the rule
                    result[y][x] = costRules[terrainType];
                } else {
                    // If no rule exists for the terrain type, default to impassable
                    result[y][x] = this.maxValue;
                }
            }
        }

        return result;
    }

    initializeGrid(defaultValue, width = this.width, height = this.height) {
        let grid = new Array(height);
        for (let y = 0; y < height; y++) {
            if(typeof defaultValue === 'object') {
                grid[y] = [];
                for(let x = 0; x < width; x++) {
                    grid[y][x] = Object.assign({}, defaultValue);
                }
            }
            else grid[y] = new Array(width).fill(defaultValue);
        }
        return grid;
    }

    //2d array
    setCostField(grid, width, height, allowDiagonal) {
        if(width) this.width = width;
        if(height) this.height = height;
        if(allowDiagonal) this.allowDiagonal = allowDiagonal;
        this.costField = grid;
        this.integrationField = this.initializeGrid(this.maxValue);
        this.flowField = this.initializeGrid({ cost: this.maxValue, direction: null });
    }

    setMazeTerrain = (maze) => {
        // Loop through each MazeCell and update the corresponding 7x7 grid
        let costField = [];
        let height = maze.height*7;
        for(let i = 0; i < height; i++) {
            costField.push([]);
        }
        for (let y = 0; y < maze.height; y++) {
            for (let x = 0; x < maze.width; x++) {
                this.setCostFieldMazeCell(x, y, maze.cells[y][x], costField, maze);
            }
        }

        return costField;
    }

    setCostFieldMazeCell(x, y, mazeCell, costField, maze) {
        // Define the 7x7 subgrid for each MazeCell
        const baseX = x * 7;
        const baseY = y * 7;

        // Set costs for the entire 7x7 grid
        for (let i = 0; i < 7; i++) {
            for (let j = 0; j < 7; j++) {
                // The corners and edges are walls if allowDiagonals is true
                let cost = this.calculateCostForMazePosition(i, j, mazeCell, maze);
                costField[baseY + j][baseX + i] = cost;
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

    updateField(goalX, goalY) { 
        // Validate goal coordinates
        if (goalX < 0 || goalX >= this.width || goalY < 0 || goalY >= this.height) {
            console.error('Goal coordinates are out of bounds');
            return;
        }

        if (this.costField[goalY][goalX] === this.maxValue) {
            console.error('Goal is on an impassable terrain');
        }

        // Reset fields before recalculating
        this.integrationField = this.initializeGrid(this.maxValue);
        this.flowField = this.initializeGrid({ x:0, y:0 });

        this.calculateIntegrationField(goalX, goalY);
        
        this.calculateFlowField();

        this.convolveFlowField(); 
    }

    calculateIntegrationField(goalX, goalY) {
        let queue = [{x: goalX, y: goalY, cost: 0}];
        const iF = this.integrationField;
        iF[goalY][goalX] = 0;
    
        while (queue.length > 0) {
            let {x, y, cost} = queue.shift();
    
            this.getNeighbors(x, y).forEach(({nx, ny}) => {
                let newCost = cost + this.costField[ny][nx];
                if (newCost < iF[ny][nx]) {
                    iF[ny][nx] = newCost;
                    queue.push({x: nx, y: ny, cost: newCost});
                }
            });
        }
    }

    calculateFlowField() {
        const {width, height, costField, maxValue, integrationField, flowField, avoidObstacles, avoidance, avoidanceDampen} = this;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (costField[y][x] !== maxValue) {
                    let lowestCost = maxValue;
                    let direction = null;
                    let hasImpassableNeighbor = false;
                    let impassableNeighborDirection = { x: 0, y: 0 };
    
                    this.getNeighbors(x, y).forEach(({nx, ny}) => {
                        let neighborCost = integrationField[ny][nx];
                        if (neighborCost < lowestCost) {
                            lowestCost = neighborCost;
                            direction = {x: nx - x, y: ny - y};
                        }
                        if (costField[ny][nx] === maxValue) {
                            hasImpassableNeighbor = true;
                            impassableNeighborDirection.x += nx - x;
                            impassableNeighborDirection.y += ny - y;
                        }
                    });
    
                    if (direction && hasImpassableNeighbor && avoidObstacles) {
                        direction = this.adjustDirectionAwayFromImpassable(direction, impassableNeighborDirection, avoidance, avoidanceDampen);
                    }
    
                    flowField[y][x] = direction;
                }
            }
        }
        this.convolveFlowField();
    }
        
    //add some avoidance from walls so they are less likely to get stuck on corners etc
    adjustDirectionAwayFromImpassable(direction, impassableNeighborDirection, multiplier=1.5, dampen=0.5) {
        // Calculate a new direction that points away from the impassable neighbor
        let adjustedDirection = {
            x: direction.x*dampen-(impassableNeighborDirection.x),
            y: direction.y*dampen-(impassableNeighborDirection.y)
        };
        
        // Normalize the adjusted direction
        let magnitude = Math.sqrt(adjustedDirection.x * adjustedDirection.x + adjustedDirection.y * adjustedDirection.y);
        if (magnitude > 0) {
            adjustedDirection.x /= magnitude;
            adjustedDirection.y /= magnitude;

            adjustedDirection.x *= multiplier;
            adjustedDirection.y *= multiplier;
        }

        return adjustedDirection;
    }

    isWithinBounds(x, y) {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    convolveFlowField() {
        // Define the kernel and its center offset for direct access
        let kernel = [0.05, 0.1, 0.05, 0.1, 0.4, 0.1, 0.05, 0.1, 0.05];
        let offsets = [-1, 0, 1];
    
        // Pre-calculate the width and height to avoid repeated access
        const {width, height} = this;
    
        // Initialize new flow field to avoid modifying the original during calculation
        let newFlowField = this.initializeGrid({x: 0, y: 0}, width, height);
    
        // Iterate over each cell excluding the border to apply the convolution
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let sumX = 0, sumY = 0;
    
                // Apply kernel to each neighbor
                for (let i = 0; i < offsets.length; i++) {
                    for (let j = 0; j < offsets.length; j++) {
                        const offsetY = offsets[i], offsetX = offsets[j];
                        const weight = kernel[(offsetY + 1) * 3 + (offsetX + 1)];
                        const neighbor = this.flowField[y + offsetY][x + offsetX];
    
                        sumX += neighbor.x * weight;
                        sumY += neighbor.y * weight;
                    }
                }
    
                // Assign the convolved value directly
                newFlowField[y][x] = {x: sumX, y: sumY};
            }
        }
    
        //note either use padding or copy edges from prev flowfield

        // Update the flow field
        this.flowField = newFlowField;
    }

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

    getNeighbors(x, y) {
        const neighbors = [];

        const directions = this.allowDiagonal ? this.directionsOct : this.directions;

        directions.forEach(({dx, dy}) => {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < this.width && ny < this.height) {
                neighbors.push({nx, ny});
            }
        });

        return neighbors;
    }

    getDirection(x, y) {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            return this.flowField[y]?.[x];
        }
        else return null;
    }

    // Method to get the cost at a specific grid cell
    getCost(x, y) {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            return this.costField[y][x];
        }
        return this.maxValue; // Return Infinity if the coordinates are outside the grid or for impassable terrain
    }








    //quick visualization code, everything after this is not relevant to the implementation

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
        const cost = this.costField[y][x];
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
        const cost = this.costField[y][x];
        const direction = this.flowField[y][x];
    
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
        if (costField[cellY][cellX] === this.maxValue) {
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
                        if (costField[newY][newX] !== this.maxValue) {
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
            const direction = flowField.getDirection(cellX, cellY);
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