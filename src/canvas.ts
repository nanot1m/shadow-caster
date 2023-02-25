const TILE_SIZE = 16
const TILE_X_COUNT = 20
const TILE_Y_COUNT = 20

function scaleCanvasByDevicePixelRatio(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
) {
    const ctx = canvas.getContext("2d")!
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)
}

type Edge = {
    sx: number
    sy: number
    ex: number
    ey: number
}

type Cell = {
    x: number
    y: number
    existEdges: [boolean, boolean, boolean, boolean]
    edgeIds: [number, number, number, number]
}

type Ray = {
    sx: number
    sy: number
    ex: number
    ey: number
    angle: number
}

function createCell(x: number, y: number): Cell {
    return {
        edgeIds: [0, 0, 0, 0],
        existEdges: [false, false, false, false],
        x,
        y,
    }
}

const NORTH = 0
const EAST = 1
const SOUTH = 2
const WEST = 3

const transactionable = (fn: () => void) => {
    let isTransaction = false
    let wasCalled = false
    const mixins = {
        lock() {
            isTransaction = true
        },
        unlock() {
            isTransaction = false
            if (wasCalled) {
                fn()
            }
            wasCalled = false
        },
        isTransaction() {
            return isTransaction
        },
    }
    return Object.assign(() => {
        if (isTransaction) {
            wasCalled = true
        } else {
            fn()
        }
    }, mixins)
}

export function setupCanvas(canvas: HTMLCanvasElement) {
    scaleCanvasByDevicePixelRatio(
        canvas,
        TILE_SIZE * TILE_X_COUNT,
        TILE_SIZE * TILE_Y_COUNT,
    )
    const ctx = canvas.getContext("2d")!

    let isCreating = false
    let isRemoving = false

    let lightSource: [number, number] | null = null

    let hovered: [number, number] | null = null
    let prevTime = performance.now()
    let renderTime = 0
    let fps = 0

    const tComputeEdges = transactionable(computeEdges)

    const { hasCell, getCell, setCell, getAllCells } = new Proxy(
        createCells(),
        {
            get(
                target: ReturnType<typeof createCells>,
                prop: keyof typeof target,
            ) {
                if (prop === "setCell") {
                    return (x: number, y: number, value: boolean) => {
                        target.setCell(x, y, value)
                        tComputeEdges()
                    }
                }
                return target[prop]
            },
        },
    )
    const { getEdge, addEdge, getAllEdges, clearEdges } = createEdges()
    const rays: Ray[] = []

    tComputeEdges.lock()
    for (let x = 0; x < TILE_X_COUNT; x++) {
        setCell(x, 0, true)
        setCell(x, TILE_Y_COUNT - 1, true)
    }
    for (let y = 0; y < TILE_Y_COUNT; y++) {
        setCell(0, y, true)
        setCell(TILE_X_COUNT - 1, y, true)
    }
    tComputeEdges.unlock()

    loop(performance.now())

    function computeEdges() {
        clearEdges()

        for (let x = 0; x < TILE_X_COUNT; x++) {
            for (let y = 0; y < TILE_Y_COUNT; y++) {
                const cell = getCell(x, y)
                if (!cell) continue

                // check north edge
                if (hasCell(x, y - 1)) {
                    cell.existEdges[NORTH] = false
                    cell.edgeIds[NORTH] = 0
                } else {
                    cell.existEdges[NORTH] = true
                    // if there is a cell on the left, use the same edge
                    const lCell = getCell(x - 1, y)
                    if (lCell && lCell.existEdges[NORTH]) {
                        const edgeId = lCell.edgeIds[NORTH]
                        const edge = getEdge(edgeId)!
                        cell.edgeIds[NORTH] = edgeId
                        edge.ex = x + 1
                    } else {
                        const edgeId = addEdge({
                            sx: x,
                            sy: y,
                            ex: x + 1,
                            ey: y,
                        })
                        cell.edgeIds[NORTH] = edgeId
                    }
                }

                // check east edge
                if (hasCell(x + 1, y)) {
                    cell.existEdges[EAST] = false
                    cell.edgeIds[EAST] = 0
                } else {
                    cell.existEdges[EAST] = true
                    // if there is a cell on the top, use the same edge
                    const tCell = getCell(x, y - 1)
                    if (tCell && tCell.existEdges[EAST]) {
                        const edgeId = tCell.edgeIds[EAST]
                        const edge = getEdge(edgeId)!
                        cell.edgeIds[EAST] = edgeId
                        edge.ey = y + 1
                    } else {
                        const edgeId = addEdge({
                            sx: x + 1,
                            sy: y,
                            ex: x + 1,
                            ey: y + 1,
                        })
                        cell.edgeIds[EAST] = edgeId
                    }
                }

                // check south edge
                if (hasCell(x, y + 1)) {
                    cell.existEdges[SOUTH] = false
                    cell.edgeIds[SOUTH] = 0
                } else {
                    cell.existEdges[SOUTH] = true
                    // if there is a cell on the left, use the same edge
                    const lCell = getCell(x - 1, y)
                    if (lCell && lCell.existEdges[SOUTH]) {
                        const edgeId = lCell.edgeIds[SOUTH]
                        const edge = getEdge(edgeId)!
                        cell.edgeIds[SOUTH] = edgeId
                        edge.ex = x + 1
                    } else {
                        const edgeId = addEdge({
                            sx: x,
                            sy: y + 1,
                            ex: x + 1,
                            ey: y + 1,
                        })
                        cell.edgeIds[SOUTH] = edgeId
                    }
                }

                // check west edge
                if (hasCell(x - 1, y)) {
                    cell.existEdges[WEST] = false
                    cell.edgeIds[WEST] = 0
                } else {
                    cell.existEdges[WEST] = true
                    // if there is a cell on the top, use the same edge
                    const tCell = getCell(x, y - 1)
                    if (tCell && tCell.existEdges[WEST]) {
                        const edgeId = tCell.edgeIds[WEST]
                        const edge = getEdge(edgeId)!
                        cell.edgeIds[WEST] = edgeId
                        edge.ey = y + 1
                    } else {
                        const edgeId = addEdge({
                            sx: x,
                            sy: y,
                            ex: x,
                            ey: y + 1,
                        })
                        cell.edgeIds[WEST] = edgeId
                    }
                }
            }
        }
    }

    function getRaysToEdges() {
        rays.length = 0
        if (!lightSource) {
            return
        }

        const visited = new Set<string>()
        const edges = getAllEdges()

        const [lx, ly] = lightSource
        for (const edge of edges) {
            const sx = edge.sx * TILE_SIZE,
                sy = edge.sy * TILE_SIZE,
                ex = edge.ex * TILE_SIZE,
                ey = edge.ey * TILE_SIZE

            for (let i = 0; i < 2; i++) {
                let x = i === 0 ? sx : ex
                let y = i === 0 ? sy : ey
                const rayKey = `${x},${y}`
                if (!visited.has(rayKey)) {
                    visited.add(rayKey)

                    const baseAng = Math.atan2(y - ly, x - lx)
                    for (let i = 0; i < 3; i++) {
                        const ang = baseAng + (i - 1) * 0.0001
                        x = lx + Math.cos(ang) * TILE_X_COUNT * TILE_SIZE * 1.5
                        y = ly + Math.sin(ang) * TILE_Y_COUNT * TILE_SIZE * 1.5

                        const ray = {
                            sx: lx,
                            sy: ly,
                            ex: x,
                            ey: y,
                            angle: ang,
                        }
                        rays.push(ray)
                    }
                }
            }
        }

        for (const ray of rays) {
            for (const edge of edges) {
                const intersection = lineIntersect(
                    ray.sx,
                    ray.sy,
                    ray.ex,
                    ray.ey,
                    edge.sx * TILE_SIZE,
                    edge.sy * TILE_SIZE,
                    edge.ex * TILE_SIZE,
                    edge.ey * TILE_SIZE,
                )
                if (intersection) {
                    const { x: ix, y: iy } = intersection
                    const dist = (ix - lx) ** 2 + (iy - ly) ** 2
                    const rayLen = (ray.ex - lx) ** 2 + (ray.ey - ly) ** 2

                    if (dist < rayLen) {
                        ray.ex = ix
                        ray.ey = iy
                    }
                }
            }
        }

        rays.sort((a, b) => a.angle - b.angle)
    }

    canvas.addEventListener("mousemove", (e) => {
        const { offsetX: x, offsetY: y } = e

        const tileX = Math.floor(x / TILE_SIZE)
        const tileY = Math.floor(y / TILE_SIZE)

        if (isCreating) {
            setCell(tileX, tileY, true)
        }
        if (isRemoving) {
            setCell(tileX, tileY, false)
        }

        lightSource = [x, y]
        hovered = [tileX, tileY]
        getRaysToEdges()
    })

    canvas.addEventListener("mouseleave", () => {
        hovered = null
        lightSource = null
    })

    canvas.addEventListener("mousedown", (e) => {
        const { offsetX: x, offsetY: y } = e
        const tileX = Math.floor(x / TILE_SIZE)
        const tileY = Math.floor(y / TILE_SIZE)
        if (e.button === 2) {
            return
        }
        const isOnCell = hasCell(tileX, tileY)
        isRemoving = isOnCell
        isCreating = !isOnCell
        setCell(tileX, tileY, !hasCell(tileX, tileY))
    })
    window.addEventListener("mouseup", () => {
        isRemoving = false
        isCreating = false
    })

    function loop(frameStartTime: number) {
        renderScene()
        renderTime = performance.now() - frameStartTime
        fps = 1000 / (frameStartTime - prevTime)
        prevTime = frameStartTime
        requestAnimationFrame(loop)
    }

    function renderScene() {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        // drawGrid()
        drawCells()
        // drawEdges()
        // drawRays()
        drawLight()
        drawLightSource()
        // drawHovered()
        drawDebug()
    }

    function drawLightSource() {
        if (!lightSource) return
        // draw sun emoji
        ctx.save()
        ctx.fillStyle = "yellow"
        ctx.globalAlpha = 1
        ctx.font = TILE_SIZE + "px sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText("🌞", lightSource[0], lightSource[1])
        ctx.restore()
    }

    function drawDebug() {
        ctx.globalAlpha = 1
        ctx.font = "10px sans-serif"
        ctx.fillStyle = "white"
        ctx.fillText(
            `RT: ${renderTime.toFixed(2)}ms; RC: ${
                rays.length
            }; FPS: ${fps.toFixed(0)}`,
            10,
            10,
        )
    }

    function drawHovered() {
        if (!hovered) return
        const [tileX, tileY] = hovered
        ctx.fillStyle = "#91a7ff"
        ctx.globalAlpha = 0.5
        ctx.fillRect(tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE)
    }

    function drawGrid() {
        for (let x = 1; x < TILE_X_COUNT; x++) {
            for (let y = 1; y < TILE_Y_COUNT; y++) {
                // fill circle
                ctx.fillStyle = "#f8f9fa"
                ctx.globalAlpha = 1
                ctx.beginPath()
                ctx.arc(x * TILE_SIZE, y * TILE_SIZE, 1, 0, Math.PI * 2)
                ctx.fill()
            }
        }
    }

    function drawCells() {
        for (const { x, y } of getAllCells()) {
            ctx.fillStyle = "#4c6ef5"
            ctx.globalAlpha = 1
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
        }
    }

    function drawEdges() {
        ctx.globalAlpha = 1
        ctx.fillStyle = "red"
        ctx.strokeStyle = "#ffe066"
        ctx.lineWidth = 1
        for (const { sx, sy, ex, ey } of getAllEdges()) {
            // ctx.beginPath()
            // ctx.arc(sx * TILE_SIZE, sy * TILE_SIZE, 2, 0, Math.PI * 2)
            // ctx.fill()

            // ctx.beginPath()
            // ctx.arc(ex * TILE_SIZE, ey * TILE_SIZE, 2, 0, Math.PI * 2)
            // ctx.fill()

            ctx.beginPath()
            ctx.moveTo(sx * TILE_SIZE, sy * TILE_SIZE)
            ctx.lineTo(ex * TILE_SIZE, ey * TILE_SIZE)
            ctx.stroke()
        }
    }

    function drawRays() {
        if (!lightSource) return

        for (const { sx, sy, ex, ey } of rays) {
            ctx.globalAlpha = 1
            ctx.strokeStyle = "white"
            ctx.lineWidth = 1

            ctx.beginPath()
            ctx.moveTo(sx, sy)
            ctx.lineTo(ex, ey)
            ctx.stroke()
        }
    }

    function drawLight() {
        if (rays.length < 1) return

        const region = new Path2D()
        region.moveTo(rays[0].ex, rays[0].ey)
        for (let i = 1; i < rays.length; i++) {
            region.lineTo(rays[i].ex, rays[i].ey)
        }
        region.closePath()

        ctx.save()
        ctx.clip(region, "nonzero")

        const [x, y] = lightSource ?? [0, 0]
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, 100)
        gradient.addColorStop(0, "rgba(255, 255, 255, 1)")
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)")
        ctx.fillStyle = gradient
        ctx.globalAlpha = 0.8

        ctx.beginPath()
        ctx.arc(x, y, 100, 0, Math.PI * 2)
        ctx.fill()

        ctx.restore()
    }
}

function createCells() {
    const cells = new Map<number, Map<number, Cell>>()

    function hasCell(x: number, y: number) {
        return cells.get(x)?.has(y) ?? false
    }

    function getCell(x: number, y: number) {
        return cells.get(x)?.get(y)
    }

    function setCell(x: number, y: number, value: boolean) {
        if (value) {
            if (!cells.has(x)) {
                cells.set(x, new Map())
            }
            cells.get(x)?.set(y, createCell(x, y))
        } else {
            cells.get(x)?.delete(y)
        }
    }

    function getAllCells() {
        const result: Cell[] = []
        for (const ys of cells.values()) {
            for (const cell of ys.values()) {
                result.push(cell)
            }
        }
        return result
    }

    return {
        hasCell,
        getCell,
        setCell,
        getAllCells,
    }
}

function createEdges() {
    const edges = new Map<number, Edge>()

    let edgeId = 1
    function getNextEdgeId() {
        return edgeId++
    }

    function getEdge(id: number) {
        return edges.get(id)
    }

    function addEdge(edge: Edge) {
        const id = getNextEdgeId()
        edges.set(id, edge)
        return id
    }

    function hasEdge(id: number) {
        return edges.has(id)
    }

    function getAllEdges() {
        return Array.from(edges.values())
    }

    function clearEdges() {
        edges.clear()
        edgeId = 1
    }

    return {
        getEdge,
        addEdge,
        hasEdge,
        clearEdges,
        getAllEdges,
    }
}

function lineIntersect(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
) {
    const sx1 = x1 - x0
    const sy1 = y1 - y0
    const sx2 = x3 - x2
    const sy2 = y3 - y2

    const s = (-sy1 * (x0 - x2) + sx1 * (y0 - y2)) / (-sx2 * sy1 + sx1 * sy2)
    const t = (sx2 * (y0 - y2) - sy2 * (x0 - x2)) / (-sx2 * sy1 + sx1 * sy2)

    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
        const i_x = x0 + t * sx1
        const i_y = y0 + t * sy1
        return { x: i_x, y: i_y }
    }

    return null
}
