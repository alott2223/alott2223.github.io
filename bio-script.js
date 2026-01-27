document.addEventListener('DOMContentLoaded', function() {
    const cursorGlow = document.querySelector('.cursor-glow');
    const notification = document.getElementById('notification');
    
    // Cursor glow effect
    document.addEventListener('mousemove', (e) => {
        cursorGlow.style.left = e.clientX - 10 + 'px';
        cursorGlow.style.top = e.clientY - 10 + 'px';
    });

    // Smooth scrolling for navigation links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Terminal typing effect
    function typeText(element, text, speed = 50) {
        element.textContent = '';
        let i = 0;
        const timer = setInterval(() => {
            if (i < text.length) {
                element.textContent += text.charAt(i);
                i++;
            } else {
                clearInterval(timer);
            }
        }, speed);
    }

    // Glitch effect for cards on hover
    document.querySelectorAll('.about-card, .project-card').forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.classList.add('glitch');
            setTimeout(() => {
                card.classList.remove('glitch');
            }, 300);
        });
    });

    // Matrix rain effect
    function createMatrixRain() {
        const matrixContainer = document.createElement('div');
        matrixContainer.className = 'matrix-rain';
        document.body.appendChild(matrixContainer);

        const characters = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
        const columns = Math.floor(window.innerWidth / 20);

        for (let i = 0; i < columns; i++) {
            const column = document.createElement('div');
            column.style.position = 'absolute';
            column.style.left = i * 20 + 'px';
            column.style.color = '#00ff41';
            column.style.fontSize = '14px';
            column.style.fontFamily = 'JetBrains Mono, monospace';
            column.style.animation = `matrix-fall ${Math.random() * 5 + 5}s linear infinite`;
            column.style.animationDelay = Math.random() * 5 + 's';
            
            let text = '';
            for (let j = 0; j < 20; j++) {
                text += characters.charAt(Math.floor(Math.random() * characters.length)) + '<br>';
            }
            column.innerHTML = text;
            
            matrixContainer.appendChild(column);
        }
    }

    // Add matrix fall animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes matrix-fall {
            0% { transform: translateY(-100vh); opacity: 1; }
            100% { transform: translateY(100vh); opacity: 0; }
        }
    `;
    document.head.appendChild(style);

    // Create scan line effect
    function createScanLine() {
        const scanLine = document.createElement('div');
        scanLine.className = 'scan-line';
        document.body.appendChild(scanLine);
    }

    // Initialize effects
    createMatrixRain();
    createScanLine();

    // Add random glitch effects
    setInterval(() => {
        const elements = document.querySelectorAll('.terminal-window, .about-card, .project-card');
        const randomElement = elements[Math.floor(Math.random() * elements.length)];
        if (randomElement && Math.random() < 0.1) {
            randomElement.classList.add('glitch');
            setTimeout(() => {
                randomElement.classList.remove('glitch');
            }, 200);
        }
    }, 5000);

    // Status indicator animation
    const statusDots = document.querySelectorAll('.status-dot.active');
    statusDots.forEach(dot => {
        setInterval(() => {
            dot.style.boxShadow = Math.random() > 0.5 ? 
                '0 0 10px rgba(0, 255, 65, 0.8)' : 
                '0 0 5px rgba(0, 255, 65, 0.5)';
        }, 1000);
    });

    // Intersection Observer for animations
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });

    // Observe elements for scroll animations
    document.querySelectorAll('.about-card, .project-card, .section-title').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
});

// Utility functions for contact actions
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification(`Copied "${text}" to clipboard!`);
    }).catch(() => {
        showNotification('Failed to copy to clipboard');
    });
}

function showNotification(message) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function openDiscord() {
    copyToClipboard('isse0688');
    showNotification('Discord username copied! Add me: isse0688');
}

function openEmail() {
    window.open('mailto:business.discord.co@gmail.com', '_blank');
    showNotification('Opening email client...');
}

function openGithub() {
    window.open('https://github.com/alott2223', '_blank');
    showNotification('Opening GitHub profile...');
}

// Konami code easter egg
let konamiCode = [];
const konamiSequence = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65]; // ↑↑↓↓←→←→BA

document.addEventListener('keydown', (e) => {
    konamiCode.push(e.keyCode);
    
    if (konamiCode.length > konamiSequence.length) {
        konamiCode.shift();
    }
    
    if (konamiCode.length === konamiSequence.length && 
        konamiCode.every((code, index) => code === konamiSequence[index])) {
        
        // Easter egg activated
        document.body.style.filter = 'hue-rotate(180deg) saturate(2)';
        showNotification('🎉 MATRIX MODE ACTIVATED! 🎉');
        
        setTimeout(() => {
            document.body.style.filter = '';
        }, 5000);
        
        konamiCode = [];
    }
});

// Add some random terminal commands
const terminalCommands = [
    'ls -la',
    'whoami',
    'cat /etc/passwd',
    'ps aux',
    'netstat -an',
    'top',
    'df -h',
    'uname -a'
];

// Random command generator
function generateRandomCommand() {
    return terminalCommands[Math.floor(Math.random() * terminalCommands.length)];
}

// Add click event to terminal for new commands
document.addEventListener('click', (e) => {
    if (e.target.closest('.terminal-body')) {
        const randomCmd = generateRandomCommand();
        console.log(`$ ${randomCmd}`);
        
        // Add subtle terminal effect
        const terminal = e.target.closest('.terminal-body');
        terminal.style.boxShadow = '0 0 20px rgba(0, 255, 65, 0.3)';
        setTimeout(() => {
            terminal.style.boxShadow = '';
        }, 500);
    }
});

// Add some cyberpunk ambiance
function addCyberpunkAmbiance() {
    // Random screen flicker
    setInterval(() => {
        if (Math.random() < 0.02) {
            document.body.style.opacity = '0.95';
            setTimeout(() => {
                document.body.style.opacity = '1';
            }, 50);
        }
    }, 1000);
    
    // Random color shifts
    setInterval(() => {
        if (Math.random() < 0.05) {
            const elements = document.querySelectorAll('.accent-primary, .nav-brand, .section-title .title-text');
            elements.forEach(el => {
                const originalColor = el.style.color;
                el.style.color = '#ff0040';
                setTimeout(() => {
                    el.style.color = originalColor;
                }, 100);
            });
        }
    }, 3000);
}

// Initialize cyberpunk effects
addCyberpunkAmbiance();

// Console art
console.log(`
     ██████╗ ██╗      ██████╗ ████████╗████████╗
    ██╔══██╗██║     ██╔═══██╗╚══██╔══╝╚══██╔══╝
    ██████╔╝██║     ██║   ██║   ██║      ██║   
    ██╔══██╗██║     ██║   ██║   ██║      ██║   
    ██║  ██║███████╗╚██████╔╝   ██║      ██║   
    ╚═╝  ╚═╝╚══════╝ ╚═════╝    ╚═╝      ╚═╝   

    Welcome to alott.bio - Digital architect & consciousness explorer
    
    Available commands:
    - Discord: isse0688
    - Email: business.discord.co@gmail.com
    - GitHub: https://github.com/alott2223
    - Mental Health: Inner Light Platform
    
    Type the Konami code for a surprise... ↑↑↓↓←→←→BA
`);

// Performance monitoring
let frameCount = 0;
let lastTime = performance.now();

function monitorPerformance() {
    frameCount++;
    const currentTime = performance.now();
    
    if (currentTime >= lastTime + 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        if (fps < 30) {
            console.warn('Performance warning: Low FPS detected', fps);
        }
        frameCount = 0;
        lastTime = currentTime;
    }
    
    requestAnimationFrame(monitorPerformance);
}

monitorPerformance();
