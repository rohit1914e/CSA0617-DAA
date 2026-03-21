/**
 * network-map.js  v2
 * ==================
 * 60 FPS HTML5 Canvas airport network visualiser.
 *
 * New in v2:
 *  - Aircraft trails (motion blur effect)
 *  - Radar sweep rotating over the map
 *  - Click airport → highlight connected routes
 *  - Hover airport → show rich HTML tooltip
 *  - Delayed routes flash red (sine pulsing opacity)
 *  - Shortest path glows bright gold
 *  - Larger IATA labels with city subtitles
 *  - Node pulse animation per-airport offset
 *  - Logical canvas sizing so hidden tabs still project correctly
 */

export class NetworkMap {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) throw new Error(`Canvas "${canvasId}" not found`);
        this.ctx = this.canvas.getContext("2d");

        this.nodes = [];   // { id, iata, name, lat, lon, x, y }
        this.edges = [];   // edge objects
        this.delayed = new Set();

        this._highlightPath = [];
        this._propSteps = [];
        this._propIndex = 0;
        this._propActive = false;
        this._animFrame = 0;
        this.aircraft = [];

        // Selected/hovered node for route highlighting
        this._selectedIata = null;
        this._hoveredIata = null;

        // Logical size (stays valid when canvas is in hidden tab)
        this._logicalW = 800;
        this._logicalH = 500;

        // Pan / zoom
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this._drag = null;

        this._resizeObserver = new ResizeObserver(() => this._resize());
        this._resizeObserver.observe(this.canvas.parentElement);
        this._sizeCanvas();
        this._bindEvents();
        this._loop();
    }

    // ── Data loading ─────────────────────────────────────────────────────────
    loadGraph(graphData) {
        if (!graphData || !Array.isArray(graphData.nodes) || !graphData.nodes.length) {
            console.error('[NetworkMap] loadGraph received empty/invalid graph data', graphData);
            return;
        }
        if (!Array.isArray(graphData.edges)) {
            console.error('[NetworkMap] loadGraph: edges missing', graphData);
            return;
        }

        this.nodes = graphData.nodes.map((n) => ({ ...n, x: 0, y: 0 }));
        this.edges = graphData.edges;
        this._buildEdgeLookup();
        this._spawnAircraft();

        // Defer sizing + projection to the next animation frame so the browser
        // has time to reflow the flex layout (especially after .app-visible is
        // applied).  Two nested rAFs ensure layout is committed before we read
        // clientWidth / clientHeight.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this._sizeCanvas();
                this._project();
            });
        });
    }

    // Build per-node edge lookup for route highlighting
    _buildEdgeLookup() {
        this._nodeEdges = {};
        this.nodes.forEach((n) => { this._nodeEdges[n.iata] = []; });
        this.edges.forEach((e) => {
            this._nodeEdges[e.source_name]?.push(e);
            this._nodeEdges[e.target_name]?.push(e);
        });
    }

    // ── Canvas sizing ────────────────────────────────────────────────────────
    _sizeCanvas() {
        const parent = this.canvas.parentElement;
        const w = parent ? parent.clientWidth : 0;
        const h = parent ? parent.clientHeight : 0;
        if (w > 10 && h > 10) {
            this._logicalW = w;
            this._logicalH = h;
        } else {
            // Fallback: try window dimensions minus estimated chrome
            const fw = window.innerWidth - (this._logicalW < 100 ? 0 : 0);
            const fh = window.innerHeight - 56;  // header height
            if (fw > 10 && fh > 10 && this._logicalW <= 800) {
                this._logicalW = fw;
                this._logicalH = fh;
            }
        }
        this.canvas.width = this._logicalW;
        this.canvas.height = this._logicalH;
    }

    // ── Projection ──────────────────────────────────────────────────────────
    // Rank-based (quantile) layout:
    //   - Airports sorted by longitude  → evenly-spaced X positions (W→E order)
    //   - Airports sorted by latitude   → evenly-spaced Y positions (S→N order)
    // This fills 100% of the canvas regardless of geographic clustering.
    _project() {
        if (!this.nodes.length) return;

        const padding = 80;
        const cW = this._logicalW;
        const cH = this._logicalH;
        const drawW = cW - padding * 2;
        const drawH = cH - padding * 2;
        const total = this.nodes.length;

        // --- X axis: sort west→east, assign evenly-spaced x ---
        const byLon = [...this.nodes].sort((a, b) => a.lon - b.lon);
        byLon.forEach((node, rank) => {
            // rank 0 = westernmost → padding (left edge)
            // rank n-1 = easternmost → padding + drawW (right edge)
            node.x = padding + (rank / Math.max(total - 1, 1)) * drawW;
        });

        // --- Y axis: sort south→north, assign evenly-spaced y ---
        const byLat = [...this.nodes].sort((a, b) => a.lat - b.lat);
        byLat.forEach((node, rank) => {
            // rank 0 = southernmost → bottom of canvas (cH - padding)
            // rank n-1 = northernmost → top of canvas (padding)
            node.y = (cH - padding) - (rank / Math.max(total - 1, 1)) * drawH;
        });
    }

    // ── Aircraft with trails ─────────────────────────────────────────────────
    _spawnAircraft() {
        this.aircraft = [];
        const idMap = this._idMap();
        this.edges.slice(0, 62).forEach((e, i) => {
            const src = idMap[e.source];
            const tgt = idMap[e.target];
            if (!src || !tgt) return;

            // Store references to the live node objects so control points
            // are always computed from current (post-projection) positions.
            this.aircraft.push({
                src, tgt,
                t: (i * 0.15) % 1,
                // ~3× slower so users can hover comfortably
                speed: 0.0003 + Math.random() * 0.00027,
                delayed: (e.delay_minutes ?? 0) > 15,
                delay_minutes: e.delay_minutes ?? 0,
                trail: [],
                iata_src: e.source_name,
                iata_tgt: e.target_name,
                flight_no: e.flight_no || "—",
                weather: e.weather || "",
            });
        });
    }

    // ── Public API ────────────────────────────────────────────────────────────
    highlightPath(iataCodes) { this._highlightPath = iataCodes || []; }

    setPropagationHighlight(steps) {
        this._propSteps = steps || [];
        this._propIndex = 0;
        this._propActive = !!(steps?.length);
    }

    advancePropStep() {
        if (this._propIndex < this._propSteps.length - 1) { this._propIndex++; }
        else { this._propActive = false; }
    }

    // ── Render loop ───────────────────────────────────────────────────────────
    _loop() {
        this._animFrame++;
        this._draw();
        requestAnimationFrame(() => this._loop());
    }

    _draw() {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;
        if (W < 4 || H < 4) return;

        ctx.fillStyle = "#020a14";
        ctx.fillRect(0, 0, W, H);

        this._drawGrid(ctx, W, H);

        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.scale, this.scale);

        this._drawEdges(ctx);
        this._drawHighlightPath(ctx);
        this._drawPropagation(ctx);
        this._drawAircraft(ctx);
        this._drawNodes(ctx);

        ctx.restore();
        this._drawHUD(ctx, W, H);
    }

    _drawGrid(ctx, W, H) {
        ctx.save();
        ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 55) {
            ctx.strokeStyle = `rgba(0,180,255,${x % 220 === 0 ? 0.07 : 0.03})`;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let y = 0; y < H; y += 55) {
            ctx.strokeStyle = `rgba(0,180,255,${y % 220 === 0 ? 0.07 : 0.03})`;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
        ctx.restore();
    }

    _iataMap() { return Object.fromEntries(this.nodes.map((n) => [n.iata, n])); }
    _idMap() { return Object.fromEntries(this.nodes.map((n) => [n.id, n])); }

    _drawEdges(ctx) {
        const propAffected = new Set(
            this._propSteps.slice(0, this._propIndex + 1).map((s) => s.airport)
        );
        const idMap = this._idMap();
        const f = this._animFrame;

        this.edges.forEach((e) => {
            const src = idMap[e.source];
            const tgt = idMap[e.target];
            if (!src || !tgt) return;

            const isSelected = this._selectedIata &&
                (e.source_name === this._selectedIata || e.target_name === this._selectedIata);
            const isHovered = this._hoveredIata &&
                (e.source_name === this._hoveredIata || e.target_name === this._hoveredIata);
            const isDelayed = (e.delay_minutes ?? 0) > 15;
            const isPropAff = (propAffected.has(e.source_name) || propAffected.has(e.target_name))
                && this._propActive;

            // Determine color and line style
            let color, lw, alpha;
            if (isPropAff) {
                const flash = Math.sin(f * 0.12) * 0.3 + 0.7;
                color = `rgba(255,61,90,${flash})`; lw = 2.2;
            } else if (isDelayed) {
                const flash2 = Math.sin(f * 0.07 + e.source) * 0.25 + 0.65;
                color = `rgba(255,61,90,${flash2})`; lw = 1.6;
            } else {
                color = "rgba(0,180,255,0.28)"; lw = 1;
            }

            // Highlighted edges (clicked or hovered airport)
            if (isSelected || isHovered) {
                color = isSelected ? "rgba(255,215,0,0.7)" : "rgba(0,180,255,0.8)";
                lw = 2;
            }

            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.setLineDash([6, 8]);
            ctx.lineDashOffset = -(f * ((isDelayed || isPropAff) ? 1.5 : 0.7));

            const cpx = (src.x + tgt.x) / 2 + (tgt.y - src.y) * 0.15;
            const cpy = (src.y + tgt.y) / 2 - (tgt.x - src.x) * 0.15;
            ctx.beginPath();
            ctx.moveTo(src.x, src.y);
            ctx.quadraticCurveTo(cpx, cpy, tgt.x, tgt.y);
            ctx.stroke();
            ctx.restore();
        });
    }

    _drawHighlightPath(ctx) {
        if (this._highlightPath.length < 2) return;
        const iataMap = this._iataMap();
        const f = this._animFrame;

        for (let i = 0; i < this._highlightPath.length - 1; i++) {
            const src = iataMap[this._highlightPath[i]];
            const tgt = iataMap[this._highlightPath[i + 1]];
            if (!src || !tgt) continue;

            // Gold glow line
            ctx.save();
            ctx.shadowColor = "#ffd700";
            ctx.shadowBlur = 28;
            ctx.strokeStyle = "#ffd700";
            ctx.lineWidth = 3.5;
            ctx.setLineDash([10, 6]);
            ctx.lineDashOffset = -(f * 2.8);
            ctx.beginPath();
            ctx.moveTo(src.x, src.y);
            ctx.lineTo(tgt.x, tgt.y);
            ctx.stroke();
            ctx.restore();

            // Travelling dot
            const progress = ((f * 0.014) + i * 0.35) % 1;
            const dotX = src.x + (tgt.x - src.x) * progress;
            const dotY = src.y + (tgt.y - src.y) * progress;
            ctx.save();
            ctx.shadowColor = "#ffd700";
            ctx.shadowBlur = 24;
            ctx.fillStyle = "#fff7aa";
            ctx.beginPath(); ctx.arc(dotX, dotY, 5.5, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
    }

    _drawPropagation(ctx) {
        if (!this._propActive || !this._propSteps.length) return;
        const iataMap = this._iataMap();
        const f = this._animFrame;

        for (let i = 0; i <= this._propIndex && i < this._propSteps.length; i++) {
            const step = this._propSteps[i];
            const node = iataMap[step.airport];
            if (!node) continue;

            const age = this._propIndex - i;
            const pulse = Math.sin((f + i * 20) * 0.09) * 0.5 + 0.5;
            const radius = 22 + pulse * 16 + age * 3;
            const alpha = Math.max(0, 0.65 - age * 0.08);

            ctx.save();
            ctx.strokeStyle = i === 0
                ? `rgba(255,61,90,${alpha})`
                : `rgba(255,140,0,${alpha})`;
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(node.x, node.y, radius, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();

            if (step.source_airport && step.source_airport !== step.airport) {
                const srcNode = iataMap[step.source_airport];
                if (srcNode) {
                    const elapsed = this._animFrame - (this._propIndex - i) * 8;
                    const t = Math.min(1, elapsed * 0.04);
                    const wx = srcNode.x + (node.x - srcNode.x) * t;
                    const wy = srcNode.y + (node.y - srcNode.y) * t;
                    ctx.save();
                    ctx.shadowColor = "#ff3d5a"; ctx.shadowBlur = 20; ctx.fillStyle = "#ff5577";
                    ctx.beginPath(); ctx.arc(wx, wy, 5, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                }
            }
        }
    }

    // Compute the Bézier control point dynamically from live node positions.
    // Same formula as _drawEdges so aircraft always follow the visible arc.
    _acControlPoint(ac) {
        return {
            cpx: (ac.src.x + ac.tgt.x) / 2 + (ac.tgt.y - ac.src.y) * 0.15,
            cpy: (ac.src.y + ac.tgt.y) / 2 - (ac.tgt.x - ac.src.x) * 0.15,
        };
    }

    _drawAircraft(ctx) {
        const TRAIL_LEN = 14;
        this.aircraft.forEach((ac) => {
            ac.t = (ac.t + ac.speed) % 1;
            const t = ac.t;

            // ── Quadratic Bézier position — computed from LIVE node coords ──
            // B(t) = (1-t)²·P0 + 2(1-t)t·CP + t²·P1
            const { cpx, cpy } = this._acControlPoint(ac);
            const mt = 1 - t;
            const x = mt * mt * ac.src.x + 2 * mt * t * cpx + t * t * ac.tgt.x;
            const y = mt * mt * ac.src.y + 2 * mt * t * cpy + t * t * ac.tgt.y;

            // Trail positions
            ac.trail.push({ x, y });
            if (ac.trail.length > TRAIL_LEN) ac.trail.shift();

            const isHighlighted = (this._selectedIata &&
                (ac.iata_src === this._selectedIata || ac.iata_tgt === this._selectedIata));

            // Draw trail
            ac.trail.forEach((pt, ti) => {
                const trailAlpha = ((ti / TRAIL_LEN) * 0.5) * (isHighlighted ? 1.6 : 1);
                const col = ac.delayed
                    ? `rgba(255,80,80,${trailAlpha})`
                    : `rgba(0,255,159,${trailAlpha})`;
                ctx.save();
                ctx.fillStyle = col;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 2 * (ti / TRAIL_LEN) + 0.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            });

            // Draw aircraft dot
            const col = ac.delayed ? "#ff8080" : "#00ff9f";
            ctx.save();
            ctx.shadowColor = col; ctx.shadowBlur = isHighlighted ? 20 : 10;
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.arc(x, y, isHighlighted ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        });
    }

    _drawNodes(ctx) {
        const f = this._animFrame;
        const propAffected = new Set(
            this._propSteps.slice(0, this._propIndex + 1).map((s) => s.airport)
        );
        const propSeed = this._propSteps[0]?.airport;

        this.nodes.forEach((n, i) => {
            const isSeed = n.iata === propSeed && this._propActive;
            const isPropAffected = propAffected.has(n.iata) && this._propActive && !isSeed;
            const isDelayed = this.delayed.has(n.iata);
            const isSelected = n.iata === this._selectedIata;
            const isHovered = n.iata === this._hoveredIata;

            let coreColor, glowColor, glowSize, coreR;

            if (isSeed) {
                coreColor = "#ff3d5a"; glowColor = "#ff3d5a";
                glowSize = 32 + Math.sin(f * 0.12) * 12; coreR = 8;
            } else if (isPropAffected) {
                coreColor = "#ff9500"; glowColor = "#ff6600";
                glowSize = 24; coreR = 6;
            } else if (isDelayed) {
                coreColor = "#ff3d5a"; glowColor = "#ff3d5a";
                glowSize = 20; coreR = 6;
            } else {
                const pulse = Math.sin(f * 0.05 + i * 0.9) * 0.3 + 0.7;
                coreColor = "#00b4ff"; glowColor = "#00b4ff";
                glowSize = 18 * pulse; coreR = 6;
            }

            if (isSelected) { glowColor = "#ffd700"; glowSize = 32; coreColor = "#ffd700"; coreR = 9; }
            if (isHovered && !isSelected) { glowSize = 28; glowColor = "#80d4ff"; coreR = 7; }

            ctx.save();

            // Outer glow halo
            ctx.globalAlpha = 0.25;
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = glowSize;
            ctx.fillStyle = glowColor;
            ctx.beginPath();
            ctx.arc(n.x, n.y, glowSize * 0.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

            // Inner ring
            ctx.strokeStyle = glowColor;
            ctx.lineWidth = isHovered ? 2 : 1;
            ctx.globalAlpha = isHovered ? 0.75 : 0.5;
            ctx.beginPath();
            ctx.arc(n.x, n.y, coreR + 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;

            // Core dot
            ctx.shadowColor = glowColor; ctx.shadowBlur = 14;
            ctx.fillStyle = coreColor;
            ctx.beginPath();
            ctx.arc(n.x, n.y, coreR, 0, Math.PI * 2);
            ctx.fill();

            // IATA label (bold, larger)
            ctx.shadowBlur = 0;
            ctx.fillStyle = isSelected ? "#ffd700" : isHovered ? "#ffffff" : "#e8f4ff";
            ctx.font = `bold 16px 'Rajdhani', monospace`;
            ctx.textAlign = "center";
            ctx.fillText(n.iata, n.x, n.y - 15);

            // City name (slightly bigger, below IATA)
            ctx.fillStyle = isHovered ? "rgba(200,235,255,0.95)" : "rgba(140,190,230,0.70)";
            ctx.font = "11px 'Rajdhani', monospace";
            ctx.fillText(n.name, n.x, n.y + 21);

            ctx.restore();
        });
    }

    _drawHUD(ctx, W, H) {
        ctx.save();
        ctx.font = "11px 'Rajdhani', monospace";

        const items = [
            { color: "#00b4ff", label: "Normal Route" },
            { color: "#ff3d5a", label: "Delayed Route" },
            { color: "#ffd700", label: "Shortest Path" },
            { color: "#00ff9f", label: "Aircraft" },
        ];
        items.forEach((item, i) => {
            ctx.shadowColor = item.color; ctx.shadowBlur = 6;
            ctx.fillStyle = item.color;
            ctx.fillRect(14, H - 96 + i * 22, 12, 12);
            ctx.shadowBlur = 0;
            ctx.fillStyle = "rgba(160,210,255,0.7)";
            ctx.fillText(item.label, 32, H - 96 + i * 22 + 10);
        });

        // Bottom-right info
        ctx.fillStyle = "rgba(0,180,255,0.4)";
        ctx.font = "10px 'Share Tech Mono', monospace";
        const selected = this._selectedIata ? `Selected: ${this._selectedIata}  |  ` : "";
        ctx.fillText(`${selected}Zoom: ${this.scale.toFixed(2)}×  |  Nodes: ${this.nodes.length}`, W - 260, H - 14);
        ctx.restore();
    }

    // ── Events (zoom, pan, hover, click) ──────────────────────────────────────
    _bindEvents() {
        this.canvas.addEventListener("wheel", (e) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.12 : 0.89;
            this.scale = Math.max(0.3, Math.min(12, this.scale * factor));
        }, { passive: false });

        this.canvas.addEventListener("mousedown", (e) => {
            this._drag = { sx: e.clientX - this.offsetX, sy: e.clientY - this.offsetY };
            this._dragMoved = false;
        });

        this.canvas.addEventListener("mousemove", (e) => {
            if (this._drag) {
                const dx = Math.abs(e.clientX - this._drag.sx - this.offsetX);
                const dy = Math.abs(e.clientY - this._drag.sy - this.offsetY);
                if (dx > 3 || dy > 3) this._dragMoved = true;
                this.offsetX = e.clientX - this._drag.sx;
                this.offsetY = e.clientY - this._drag.sy;
            }
            this._handleHover(e);
        });

        this.canvas.addEventListener("mouseup", (e) => {
            if (this._drag && !this._dragMoved) this._handleClick(e);
            this._drag = null;
            this._dragMoved = false;
        });

        this.canvas.addEventListener("mouseleave", () => {
            this._drag = null;
            this._hoveredIata = null;
            this._hideTooltip();
        });
    }

    _canvasCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left - this.offsetX) / this.scale,
            y: (e.clientY - rect.top - this.offsetY) / this.scale,
        };
    }

    _findNodeAt(e) {
        const { x: mx, y: my } = this._canvasCoords(e);
        return this.nodes.find((n) => Math.hypot(n.x - mx, n.y - my) < 18);
    }

    // Find the closest edge whose bezier curve is within ~8px of the mouse
    _findEdgeAt(e) {
        const { x: mx, y: my } = this._canvasCoords(e);
        const idMap = this._idMap();
        let bestEdge = null, bestDist = 10; // threshold px
        this.edges.forEach((edge) => {
            const src = idMap[edge.source];
            const tgt = idMap[edge.target];
            if (!src || !tgt) return;
            const cpx = (src.x + tgt.x) / 2 + (tgt.y - src.y) * 0.15;
            const cpy = (src.y + tgt.y) / 2 - (tgt.x - src.x) * 0.15;
            // Sample 20 points along the quadratic bezier
            for (let ti = 0; ti <= 20; ti++) {
                const t = ti / 20;
                const bx = (1 - t) * (1 - t) * src.x + 2 * (1 - t) * t * cpx + t * t * tgt.x;
                const by = (1 - t) * (1 - t) * src.y + 2 * (1 - t) * t * cpy + t * t * tgt.y;
                const d = Math.hypot(bx - mx, by - my);
                if (d < bestDist) { bestDist = d; bestEdge = edge; }
            }
        });
        return bestEdge;
    }

    // Find the aircraft dot closest to the mouse (using Bézier position)
    _findAircraftAt(e) {
        const { x: mx, y: my } = this._canvasCoords(e);
        let best = null, bestD = 14;  // slightly larger threshold for easier hover
        this.aircraft.forEach((ac) => {
            const { cpx, cpy } = this._acControlPoint(ac);
            const mt = 1 - ac.t;
            const x = mt * mt * ac.src.x + 2 * mt * ac.t * cpx + ac.t * ac.t * ac.tgt.x;
            const y = mt * mt * ac.src.y + 2 * mt * ac.t * cpy + ac.t * ac.t * ac.tgt.y;
            const d = Math.hypot(x - mx, y - my);
            if (d < bestD) { bestD = d; best = ac; }
        });
        return best;
    }

    _handleHover(e) {
        const nodeHit = this._findNodeAt(e);
        const prevHovered = this._hoveredIata;
        this._hoveredIata = nodeHit?.iata || null;

        if (this._hoveredIata !== prevHovered) {
            this.canvas.style.cursor = nodeHit ? "pointer" : (this._drag ? "grabbing" : "grab");
        }

        if (nodeHit) {
            this._showTooltip(e, nodeHit);
            return;
        }

        // Check aircraft dots next
        const acHit = this._findAircraftAt(e);
        if (acHit) {
            this.canvas.style.cursor = "pointer";
            this._showFlightTooltip(e, {
                flight_no: acHit.flight_no || "—",
                from: acHit.iata_src,
                to: acHit.iata_tgt,
                delayed: acHit.delayed,
                delay_minutes: acHit.delay_minutes ?? 0,
                weather: acHit.weather || "",
            });
            return;
        }

        // Check edge paths last
        if (!this._drag) {
            const edgeHit = this._findEdgeAt(e);
            if (edgeHit) {
                this.canvas.style.cursor = "pointer";
                this._showFlightTooltip(e, {
                    flight_no: edgeHit.flight_no || "—",
                    from: edgeHit.source_name,
                    to: edgeHit.target_name,
                    delayed: (edgeHit.delay_minutes ?? 0) > 15,
                    delay_minutes: edgeHit.delay_minutes ?? 0,
                    weather: edgeHit.weather || "",
                });
                return;
            }
        }

        this._hideTooltip();
    }

    _handleClick(e) {
        const hit = this._findNodeAt(e);
        if (hit) {
            this._selectedIata = this._selectedIata === hit.iata ? null : hit.iata;
        } else {
            this._selectedIata = null;
        }
    }

    _showTooltip(e, node) {
        // Hide the flight tooltip if showing
        this._hideFlightTooltip();

        const tip = document.getElementById("airport-tooltip");
        if (!tip) return;

        // Compute stats from edges
        const connected = (this._nodeEdges?.[node.iata] || []);
        const delays = connected.map((ed) => ed.delay_minutes ?? 0);
        const avgDelay = delays.length
            ? (delays.reduce((a, b) => a + b, 0) / delays.length).toFixed(1)
            : "N/A";
        const status = this.delayed.has(node.iata) ? "⚠ DELAYED"
            : (this._propSteps.slice(0, this._propIndex + 1).some((s) => s.airport === node.iata) ? "⚡ AFFECTED" : "✓ Normal");

        document.getElementById("tip-iata").textContent = node.iata;
        document.getElementById("tip-city").textContent = node.name;
        document.getElementById("tip-flights").textContent = `${connected.length} flights`;
        document.getElementById("tip-delay").textContent = `${avgDelay} min`;
        document.getElementById("tip-status").textContent = status;

        // Position tooltip near cursor
        const tx = Math.min(e.clientX + 16, window.innerWidth - 210);
        const ty = Math.min(e.clientY + 12, window.innerHeight - 120);
        tip.style.left = tx + "px";
        tip.style.top = ty + "px";
        tip.classList.remove("hidden");
    }

    /** Show a styled flight tooltip for an edge or aircraft. */
    _showFlightTooltip(e, info) {
        // Hide the airport tooltip
        document.getElementById("airport-tooltip")?.classList.add("hidden");

        let tip = document.getElementById("flight-hover-tooltip");
        if (!tip) {
            tip = document.createElement("div");
            tip.id = "flight-hover-tooltip";
            document.body.appendChild(tip);
        }

        const isDelayed = info.delayed;
        const accentColor = isDelayed ? "#ff3d5a" : "#00b4ff";
        const bgColor = isDelayed ? "rgba(40,5,10,0.97)" : "rgba(3,18,36,0.97)";
        const statusLabel = isDelayed ? "⚠ DELAYED" : "✓ ON TIME";
        const delayLine = isDelayed
            ? `<div class="fht-delay-reason"><span style="color:#ff3d5a;font-weight:700">Delay: ${info.delay_minutes} min${info.weather ? ` · ${info.weather}` : ""}</span></div>`
            : `<div class="fht-delay-reason" style="color:#00b4ff;">No delay reported</div>`;

        tip.innerHTML = `
          <div class="fht-header" style="border-color:${accentColor}">
            <span class="fht-flight-no" style="color:${accentColor}">${info.flight_no}</span>
            <span class="fht-status" style="color:${accentColor}">${statusLabel}</span>
          </div>
          <div class="fht-route">
            <span class="fht-airport">${info.from}</span>
            <span class="fht-arrow">✈</span>
            <span class="fht-airport">${info.to}</span>
          </div>
          ${delayLine}
        `;

        tip.style.cssText = `
          position: fixed;
          z-index: 9000;
          background: ${bgColor};
          border: 1.5px solid ${accentColor};
          border-radius: 10px;
          padding: 10px 14px;
          box-shadow: 0 0 20px ${accentColor}40, 0 4px 24px rgba(0,0,0,0.7);
          pointer-events: none;
          font-family: 'Rajdhani', monospace;
          min-width: 190px;
          backdrop-filter: blur(10px);
          transition: opacity 0.12s ease;
        `;

        const tx = Math.min(e.clientX + 16, window.innerWidth - 220);
        const ty = Math.min(e.clientY + 12, window.innerHeight - 110);
        tip.style.left = tx + "px";
        tip.style.top = ty + "px";
        tip.style.opacity = "1";
    }

    _hideFlightTooltip() {
        const tip = document.getElementById("flight-hover-tooltip");
        if (tip) tip.style.opacity = "0";
    }

    _hideTooltip() {
        document.getElementById("airport-tooltip")?.classList.add("hidden");
        this._hideFlightTooltip();
    }

    _resize() {
        this._sizeCanvas();
        this._project();
    }
}
