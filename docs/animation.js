// Animation controller for bouncing emotes
(function () {
    const canvas = document.getElementById('emote-canvas');
    const ctx = canvas.getContext('2d');

    let emoteParticles = [];
    let images = new Map(); // Cache loaded images
    let animationFrame = null;

    // Resize canvas to fill container
    function resizeCanvas() {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Particle class for bouncing emotes
    class EmoteParticle {
        constructor(imageUrl, emoteKey, count) {
            this.imageUrl = imageUrl;
            this.emoteKey = emoteKey;
            this.count = count;
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.min(58 + Math.log(count) * 8, 64); // Size based on count
            this.vx = (Math.random() - 0.5) * 3;
            this.vy = (Math.random() - 0.5) * 3;
            this.rotation = Math.random() * Math.PI * 2;
            this.rotationSpeed = (Math.random() - 0.5) * 0.05;
            this.opacity = 0.9;
            this.loaded = false;

            // Load image if not cached
            if (images.has(imageUrl)) {
                this.image = images.get(imageUrl);
                this.loaded = this.image.complete;
            } else {
                this.image = new Image();
                this.image.crossOrigin = 'anonymous';
                this.image.onload = () => {
                    this.loaded = true;
                    images.set(imageUrl, this.image);
                };
                this.image.onerror = () => {
                    console.warn('Failed to load emote:', imageUrl);
                };
                this.image.src = imageUrl;
            }
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;
            this.rotation += this.rotationSpeed;

            // Bounce off walls
            if (this.x - this.size / 2 < 0 || this.x + this.size / 2 > canvas.width) {
                this.vx *= -1;
                this.x = Math.max(this.size / 2, Math.min(canvas.width - this.size / 2, this.x));
            }
            if (this.y - this.size / 2 < 0 || this.y + this.size / 2 > canvas.height) {
                this.vy *= -1;
                this.y = Math.max(this.size / 2, Math.min(canvas.height - this.size / 2, this.y));
            }
        }

        draw() {
            if (!this.loaded) return;

            ctx.save();
            ctx.globalAlpha = this.opacity;
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);

            // Draw emote
            ctx.drawImage(
                this.image,
                -this.size / 2,
                -this.size / 2,
                this.size,
                this.size
            );

            ctx.restore();
        }
    }

    // Animation loop
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        emoteParticles.forEach(particle => {
            particle.update();
            particle.draw();
        });

        animationFrame = requestAnimationFrame(animate);
    }

    // Update particles from emote counts
    function updateFromEmoteCounts(emoteCounts, emoteMeta) {
        // Get top emotes (limit total particles to prevent performance issues)
        const topEmotes = Object.entries(emoteCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50); // More emotes allowed

        // Build map of how many particles each emote should have
        const targetCounts = new Map();
        topEmotes.forEach(([key, count]) => {
            targetCounts.set(key, Math.min(count, 100)); // Cap at 100 per emote
        });

        // Remove particles for emotes no longer in use
        emoteParticles = emoteParticles.filter(p => targetCounts.has(p.emoteKey));

        // Add/remove particles to match counts
        targetCounts.forEach((targetCount, key) => {
            const meta = emoteMeta[key];
            if (!meta || !meta.url) return;

            const currentCount = emoteParticles.filter(p => p.emoteKey === key).length;

            if (currentCount < targetCount) {
                // Add more particles
                for (let i = 0; i < targetCount - currentCount; i++) {
                    emoteParticles.push(new EmoteParticle(meta.url, key, 1));
                }
            } else if (currentCount > targetCount) {
                // Remove excess particles
                const toRemove = currentCount - targetCount;
                const matching = emoteParticles.filter(p => p.emoteKey === key);
                for (let i = 0; i < toRemove; i++) {
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

    console.log('[ANIMATION] Emote animation initialized');
})();