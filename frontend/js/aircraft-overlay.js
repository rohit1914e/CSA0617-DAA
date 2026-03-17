/**
 * aircraft-overlay.js
 * ===================
 * Persistent aircraft overlay that hovers near the centre of the viewport
 * and moves with subtle parallax motion as modules transition.
 *
 * Layers (z-index order, lowest → highest):
 *  Layer 1  — background grid (canvas, in network-map)
 *  Layer 2  — airport network graph (canvas, in network-map)
 *  Layer 3  — UI panels (HTML)
 *  Layer 4  — aircraft overlay (this module, z-index 300)
 */

export class AircraftOverlay {
    constructor() {
        this._mount();
        this._parallaxX = 0;
        this._parallaxY = 0;
        this._targetX = 0;
        this._targetY = 0;
        this._baseX = 0;   // set after first layout
        this._baseY = 0;
        this._angle = -35; // default flight angle (deg)
        this._targetAngle = -35;
        this._glowPhase = 0;
        this._trailPhase = 0;
        this._isTransitioning = false;
        this._bindMouseParallax();
        this._loop();
    }

    // ── Build DOM ──────────────────────────────────────────────────────────────
    _mount() {
        // Wrapper
        this.el = document.createElement('div');
        this.el.id = 'aircraft-overlay';
        this.el.innerHTML = this._svgMarkup();
        document.body.appendChild(this.el);

        // Contrail canvas behind the SVG
        this.trailCanvas = document.createElement('canvas');
        this.trailCanvas.id = 'aircraft-trail-canvas';
        document.body.appendChild(this.trailCanvas);
        this.trailCtx = this.trailCanvas.getContext('2d');

        this._sizeTrailCanvas();
        window.addEventListener('resize', () => this._sizeTrailCanvas());
    }

    _svgMarkup() {
        // Sleek top-down aircraft SVG with glow filter
        return `
        <svg id="aircraft-svg" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" width="90" height="90">
          <defs>
            <filter id="ac-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="4" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <filter id="ac-glow-strong" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="7" result="blur2"/>
              <feMerge>
                <feMergeNode in="blur2"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <linearGradient id="ac-body-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stop-color="#00d4ff"/>
              <stop offset="60%"  stop-color="#0088cc"/>
              <stop offset="100%" stop-color="#004488"/>
            </linearGradient>
            <linearGradient id="ac-wing-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%"   stop-color="#00aaee" stop-opacity="0.9"/>
              <stop offset="100%" stop-color="#002244" stop-opacity="0.7"/>
            </linearGradient>
          </defs>

          <!-- Engine glow rings -->
          <circle cx="60" cy="60" r="42" fill="none" stroke="rgba(0,180,255,0.06)" stroke-width="1" class="ac-ring-outer"/>
          <circle cx="60" cy="60" r="28" fill="none" stroke="rgba(0,180,255,0.10)" stroke-width="1" class="ac-ring-inner"/>

          <!-- Wing shadow -->
          <ellipse cx="60" cy="68" rx="38" ry="10" fill="rgba(0,80,140,0.25)"/>

          <!-- Main wings -->
          <path d="M 60 52  L 18 78  L 28 80  L 60 66  L 92 80  L 102 78  Z"
                fill="url(#ac-wing-grad)" filter="url(#ac-glow)" opacity="0.95"/>

          <!-- Fuselage -->
          <path d="M 60 18  L 66 60  L 64 95  L 60 100  L 56 95  L 54 60  Z"
                fill="url(#ac-body-grad)" filter="url(#ac-glow-strong)"/>

          <!-- Cockpit highlight -->
          <ellipse cx="60" cy="30" rx="4" ry="7" fill="rgba(200,240,255,0.85)" filter="url(#ac-glow)"/>

          <!-- Tail fins -->
          <path d="M 60 85  L 48 98  L 52 98  L 60 90  L 68 98  L 72 98  Z"
                fill="url(#ac-wing-grad)" opacity="0.85"/>

          <!-- Engine nacelles -->
          <ellipse cx="38" cy="72" rx="6" ry="3.5" fill="#00d4ff" opacity="0.7" filter="url(#ac-glow)"/>
          <ellipse cx="82" cy="72" rx="6" ry="3.5" fill="#00d4ff" opacity="0.7" filter="url(#ac-glow)"/>

          <!-- Engine afterburner glow -->
          <ellipse cx="38" cy="75" rx="4" ry="2" fill="rgba(0,255,200,0.5)" class="ac-engine-glow"/>
          <ellipse cx="82" cy="75" rx="4" ry="2" fill="rgba(0,255,200,0.5)" class="ac-engine-glow"/>

          <!-- Wingtip nav lights -->
          <circle cx="18" cy="79" r="2.5" fill="#00ff88" class="ac-nav-light-green"/>
          <circle cx="102" cy="79" r="2.5" fill="#ff4455" class="ac-nav-light-red"/>

          <!-- Beacon -->
          <circle cx="60" cy="60" r="3" fill="#ffffff" class="ac-beacon"/>
        </svg>`;
    }

    _sizeTrailCanvas() {
        this.trailCanvas.width = window.innerWidth;
        this.trailCanvas.height = window.innerHeight;
    }

    // ── Parallax from mouse ───────────────────────────────────────────────────
    _bindMouseParallax() {
        window.addEventListener('mousemove', (e) => {
            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;
            // Move ±20px relative to center
            this._targetX = (e.clientX - cx) / cx * 20;
            this._targetY = (e.clientY - cy) / cy * 12;
        });
    }

    // ── Public: called on tab/module change ───────────────────────────────────
    onModuleChange(tabName) {
        this._isTransitioning = true;
        // Tilt slightly based on module
        const angles = {
            map: -35,
            propagation: -22,
            shortest: -42,
            performance: -30,
        };
        this._targetAngle = angles[tabName] ?? -35;
        setTimeout(() => { this._isTransitioning = false; }, 600);
    }

    // ── Render loop ───────────────────────────────────────────────────────────
    _loop() {
        this._glowPhase += 0.025;
        this._trailPhase += 0.018;

        // Smooth lerp for parallax
        this._parallaxX += (this._targetX - this._parallaxX) * 0.06;
        this._parallaxY += (this._targetY - this._parallaxY) * 0.06;

        // Lerp angle
        this._angle += (this._targetAngle - this._angle) * 0.04;

        this._updatePosition();
        this._updateGlow();
        this._drawTrail();

        requestAnimationFrame(() => this._loop());
    }

    _updatePosition() {
        // Floating bob
        const bobX = Math.sin(this._glowPhase * 0.7) * 6;
        const bobY = Math.sin(this._glowPhase * 0.5) * 8;

        const x = this._parallaxX + bobX;
        const y = this._parallaxY + bobY;

        this.el.style.transform =
            `translate(${x}px, ${y}px) rotate(${this._angle}deg) ` +
            `scale(${this._isTransitioning ? 1.12 : 1.0})`;

        // Store world position for trail
        const rect = this.el.getBoundingClientRect();
        this._worldX = rect.left + rect.width / 2;
        this._worldY = rect.top + rect.height / 2;
    }

    _updateGlow() {
        const svg = this.el.querySelector('#aircraft-svg');
        if (!svg) return;

        const pulse = Math.sin(this._glowPhase) * 0.3 + 0.7;

        // Pulse beacon
        const beacon = svg.querySelector('.ac-beacon');
        if (beacon) beacon.setAttribute('opacity', pulse.toFixed(2));

        // Pulsing engine glow
        const engines = svg.querySelectorAll('.ac-engine-glow');
        engines.forEach(e => {
            e.setAttribute('opacity', (0.3 + pulse * 0.5).toFixed(2));
        });

        // Nav lights blink
        const green = svg.querySelector('.ac-nav-light-green');
        const red = svg.querySelector('.ac-nav-light-red');
        const navPulse = Math.sin(this._glowPhase * 2.5) > 0 ? 1 : 0.15;
        if (green) green.setAttribute('opacity', navPulse.toFixed(2));
        if (red) red.setAttribute('opacity', (1 - navPulse + 0.15).toFixed(2));

        // Outer glow rings rotate subtly
        const outer = svg.querySelector('.ac-ring-outer');
        const inner = svg.querySelector('.ac-ring-inner');
        if (outer) outer.setAttribute('stroke-dasharray', `${4 + pulse * 4} ${8}`);
        if (inner) inner.setAttribute('stroke-dasharray', `${2 + pulse * 2} ${12}`);
    }

    // ── Contrail drawing on a faded canvas ───────────────────────────────────
    _drawTrail() {
        const ctx = this.trailCtx;
        const W = this.trailCanvas.width;
        const H = this.trailCanvas.height;

        // Very slow fade — creates persistent soft contrail
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 0.012;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;

        if (!this._worldX) return;

        // Draw contrail dot at current position
        const grd = ctx.createRadialGradient(
            this._worldX, this._worldY, 0,
            this._worldX, this._worldY, 18
        );
        grd.addColorStop(0, 'rgba(0,212,255,0.28)');
        grd.addColorStop(0.5, 'rgba(0,150,200,0.10)');
        grd.addColorStop(1, 'rgba(0,100,160,0.0)');

        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(this._worldX, this._worldY, 18, 0, Math.PI * 2);
        ctx.fill();
    }
}
