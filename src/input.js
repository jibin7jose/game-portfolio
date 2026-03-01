// ─── INPUT CONTROLLER ────────────────────────────────────────────────────────
export class InputController {
    constructor() {
        this.keys = {};
        this._pressedThisFrame = new Set();
        this.mouse = { dx: 0, dy: 0, x: 0, y: 0 };

        window.addEventListener('keydown', e => {
            const k = e.key.toLowerCase();
            if (!this.keys[k]) this._pressedThisFrame.add(k);
            this.keys[k] = true;
            this.keys[e.key] = true;
            // Prevent scroll on arrow/space
            if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', e => {
            this.keys[e.key.toLowerCase()] = false;
            this.keys[e.key] = false;
        });

        window.addEventListener('mousemove', e => {
            this.mouse.dx += e.movementX;
            this.mouse.dy += e.movementY;
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });

        // Touch support (mobile)
        this._setupTouch();
    }

    wasPressed(key) {
        return this._pressedThisFrame.has(key.toLowerCase());
    }

    flush() {
        this._pressedThisFrame.clear();
        this.mouse.dx = 0;
        this.mouse.dy = 0;
    }

    _setupTouch() {
        // Virtual joystick state
        this._touch = { active: false, startX: 0, startY: 0, x: 0, y: 0 };

        const onStart = (e) => {
            const t = e.touches[0];
            this._touch.active = true;
            this._touch.startX = t.clientX;
            this._touch.startY = t.clientY;
            this._touch.x = 0;
            this._touch.y = 0;
        };

        const onMove = (e) => {
            if (!this._touch.active) return;
            const t = e.touches[0];
            this._touch.x = (t.clientX - this._touch.startX) / 60;
            this._touch.y = (t.clientY - this._touch.startY) / 60;

            // Map to keys
            this.keys['w'] = this._touch.y < -0.3;
            this.keys['s'] = this._touch.y > 0.3;
            this.keys['a'] = this._touch.x < -0.3;
            this.keys['d'] = this._touch.x > 0.3;
        };

        const onEnd = () => {
            this._touch.active = false;
            ['w', 's', 'a', 'd'].forEach(k => { this.keys[k] = false; });
        };

        window.addEventListener('touchstart', onStart, { passive: true });
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('touchend', onEnd);
        window.addEventListener('touchcancel', onEnd);
    }
}
