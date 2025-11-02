// Animation controller for bouncing emotes using DOM elements
(function () {
    const container = document.getElementById('emote-canvas');
    let emoteParticles = [];
    let images = new Map();
    let animationFrame = null;
    let containerRect = null;

    function updateContainerRect() {
        containerRect = container.getBoundingClientRect();
    }

    window.addEventListener('resize', updateContainerRect);
    // Wait for layout to settle before getting initial dimensions
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateContainerRect);
    } else {
        // DOM already loaded, wait one frame to ensure layout is complete
        requestAnimationFrame(() => {
            updateContainerRect();
        });
    }

    // Particle class for bouncing emotes
    class EmoteParticle {
        constructor(imageUrl, emoteKey, count) {
            this.imageUrl = imageUrl;
            this.emoteKey = emoteKey;
            this.count = count;

            const rect = container.getBoundingClientRect();
            this.x = Math.random() * (rect.width - 64);
            this.y = Math.random() * (rect.height - 64);
            this.baseSize = Math.min(58 + Math.log(count) * 8, 64);
            this.vx = (Math.random() - 0.5) * 3;
            this.vy = (Math.random() - 0.5) * 3;
            this.rotation = Math.random() * 360;
            this.rotationSpeed = (Math.random() - 0.5) * 2;
            this.opacity = 0.9;

            // Create DOM element
            this.element = document.createElement('img');
            this.element.src = imageUrl;
            this.element.alt = emoteKey;
            this.element.crossOrigin = 'anonymous';
            this.element.style.position = 'absolute';
            this.element.style.pointerEvents = 'none';
            this.element.style.maxWidth = this.baseSize + 'px';
            this.element.style.maxHeight = this.baseSize + 'px';
            this.element.style.opacity = this.opacity;
            this.element.style.transform = `translate(${this.x}px, ${this.y}px) rotate(${this.rotation}deg)`;

            container.appendChild(this.element);

            this.element.onerror = () => {
                console.warn('Failed to load emote:', imageUrl);
                this.remove();
            };
        }

        update() {
            const width = this.element.offsetWidth || this.baseSize;
            const height = this.element.offsetHeight || this.baseSize;

            this.x += this.vx;
            this.y += this.vy;
            this.rotation += this.rotationSpeed;

            // Bounce off walls
            if (this.x < 0 || this.x + width > containerRect.width) {
                this.vx *= -1;
                this.x = Math.max(0, Math.min(containerRect.width - width, this.x));
            }
            if (this.y < 0 || this.y + height > containerRect.height) {
                this.vy *= -1;
                this.y = Math.max(0, Math.min(containerRect.height - height, this.y));
            }

            // Update DOM position
            this.element.style.transform = `translate(${this.x}px, ${this.y}px) rotate(${this.rotation}deg)`;
        }

        remove() {
            if (this.element && this.element.parentNode) {
                this.element.parentNode.removeChild(this.element);
            }
        }
    }

    // Animation loop
    function animate() {
        emoteParticles.forEach(particle => {
            particle.update();
        });

        animationFrame = requestAnimationFrame(animate);
    }

    // Update particles from emote counts
    function updateFromEmoteCounts(emoteCounts, emoteMeta) {
        const topEmotes = Object.entries(emoteCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50);

        const targetCounts = new Map();
        topEmotes.forEach(([key, count]) => {
            targetCounts.set(key, Math.min(count, 100));
        });

        // Remove particles for emotes no longer in use
        emoteParticles = emoteParticles.filter(p => {
            if (!targetCounts.has(p.emoteKey)) {
                p.remove();
                return false;
            }
            return true;
        });

        // Add/remove particles to match counts
        targetCounts.forEach((targetCount, key) => {
            const meta = emoteMeta[key];
            if (!meta || !meta.url) return;

            const currentCount = emoteParticles.filter(p => p.emoteKey === key).length;

            if (currentCount < targetCount) {
                for (let i = 0; i < targetCount - currentCount; i++) {
                    emoteParticles.push(new EmoteParticle(meta.url, key, 1));
                }
            } else if (currentCount > targetCount) {
                const toRemove = currentCount - targetCount;
                const matching = emoteParticles.filter(p => p.emoteKey === key);
                for (let i = 0; i < toRemove; i++) {
                    matching[i].remove();
                    const idx = emoteParticles.indexOf(matching[i]);
                    if (idx !== -1) emoteParticles.splice(idx, 1);
                }
            }
        });
    }

    // Expose update function globally
    window.updateEmoteAnimation = function (emoteCounts, emoteMeta) {
        updateFromEmoteCounts(emoteCounts, emoteMeta);
    };

    // Start animation
    animate();

    console.log('[ANIMATION] Emote animation initialized (DOM mode)');
})();