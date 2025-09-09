document.addEventListener('DOMContentLoaded', function() {
    const navbar = document.querySelector('.navbar');
    const navLinks = document.querySelectorAll('.nav-menu a');
    const sections = document.querySelectorAll('.section');
    
    function handleScroll() {
        const scrolled = window.scrollY > 50;
        navbar.classList.toggle('scrolled', scrolled);
        
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (scrollY >= sectionTop - 200) {
                current = section.getAttribute('id');
            }
        });
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href').substring(1) === current) {
                link.classList.add('active');
            }
        });
    }
    
    window.addEventListener('scroll', handleScroll);
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            const targetSection = document.getElementById(targetId);
            
            if (targetSection) {
                const offsetTop = targetSection.offsetTop - 80;
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
            }
        });
    });
    
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);
    
    const fadeElements = document.querySelectorAll('.insight-card, .phase, .growth-card, .resource-category, .truth-card');
    fadeElements.forEach(el => {
        el.classList.add('fade-in');
        observer.observe(el);
    });
    
    function createBreathingExercise() {
        const breathingContainer = document.createElement('div');
        breathingContainer.className = 'breathing-exercise';
        breathingContainer.innerHTML = `
            <div class="breathing-circle">
                <div class="breathing-text">Click to Start</div>
            </div>
            <div class="breathing-instructions">
                <p>Follow the circle to regulate your breathing</p>
                <button class="breathing-btn" onclick="startBreathing()">Start Breathing Exercise</button>
            </div>
        `;
        
        const resourcesSection = document.querySelector('#resources .container');
        if (resourcesSection) {
            resourcesSection.appendChild(breathingContainer);
        }
    }
    
    window.startBreathing = function() {
        const circle = document.querySelector('.breathing-circle');
        const text = document.querySelector('.breathing-text');
        const btn = document.querySelector('.breathing-btn');
        
        let phase = 0;
        const phases = ['Breathe In', 'Hold', 'Breathe Out', 'Hold'];
        const durations = [4000, 4000, 4000, 4000];
        
        btn.textContent = 'Stop';
        btn.onclick = stopBreathing;
        
        function cycle() {
            text.textContent = phases[phase];
            circle.style.transform = phase === 0 ? 'scale(1.5)' : phase === 2 ? 'scale(0.8)' : 'scale(1.2)';
            circle.style.transition = `transform ${durations[phase]}ms ease-in-out`;
            
            setTimeout(() => {
                phase = (phase + 1) % 4;
                if (window.breathingActive) {
                    cycle();
                }
            }, durations[phase]);
        }
        
        window.breathingActive = true;
        cycle();
    };
    
    window.stopBreathing = function() {
        window.breathingActive = false;
        const circle = document.querySelector('.breathing-circle');
        const text = document.querySelector('.breathing-text');
        const btn = document.querySelector('.breathing-btn');
        
        circle.style.transform = 'scale(1)';
        text.textContent = 'Click to Start';
        btn.textContent = 'Start Breathing Exercise';
        btn.onclick = startBreathing;
    };
    
    function createMoodTracker() {
        const moodContainer = document.createElement('div');
        moodContainer.className = 'mood-tracker';
        moodContainer.innerHTML = `
            <h3>Daily Mood Check-In</h3>
            <div class="mood-options">
                <button class="mood-btn" data-mood="1">😔</button>
                <button class="mood-btn" data-mood="2">😕</button>
                <button class="mood-btn" data-mood="3">😐</button>
                <button class="mood-btn" data-mood="4">🙂</button>
                <button class="mood-btn" data-mood="5">😊</button>
            </div>
            <div class="mood-message"></div>
            <div class="mood-history">
                <h4>Your Recent Moods</h4>
                <div class="mood-chart"></div>
            </div>
        `;
        
        const resourcesSection = document.querySelector('#resources .container');
        if (resourcesSection) {
            resourcesSection.appendChild(moodContainer);
        }
        
        const moodBtns = document.querySelectorAll('.mood-btn');
        const moodMessage = document.querySelector('.mood-message');
        const moodChart = document.querySelector('.mood-chart');
        
        const messages = {
            1: "It's okay to feel down. You're not alone, and this feeling will pass.",
            2: "Difficult days are part of life. Be gentle with yourself today.",
            3: "Neutral days are valid too. Sometimes just getting through is enough.",
            4: "It's good to hear you're feeling positive today!",
            5: "Wonderful! Your joy is a gift to yourself and others."
        };
        
        moodBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const mood = this.dataset.mood;
                const today = new Date().toDateString();
                
                moodBtns.forEach(b => b.classList.remove('selected'));
                this.classList.add('selected');
                
                moodMessage.innerHTML = `<p>${messages[mood]}</p>`;
                
                let moodHistory = JSON.parse(localStorage.getItem('moodHistory') || '[]');
                moodHistory = moodHistory.filter(entry => entry.date !== today);
                moodHistory.push({ date: today, mood: parseInt(mood) });
                moodHistory = moodHistory.slice(-7);
                localStorage.setItem('moodHistory', JSON.stringify(moodHistory));
                
                updateMoodChart();
            });
        });
        
        function updateMoodChart() {
            const moodHistory = JSON.parse(localStorage.getItem('moodHistory') || '[]');
            moodChart.innerHTML = moodHistory.map(entry => {
                const emoji = ['', '😔', '😕', '😐', '🙂', '😊'][entry.mood];
                return `<div class="mood-entry">
                    <div class="mood-date">${new Date(entry.date).toLocaleDateString()}</div>
                    <div class="mood-emoji">${emoji}</div>
                </div>`;
            }).join('');
        }
        
        updateMoodChart();
    }
    
    function createAffirmationGenerator() {
        const affirmations = [
            "You are worthy of love and respect exactly as you are.",
            "Your feelings are valid and deserve to be acknowledged.",
            "You have survived 100% of your difficult days so far.",
            "You are stronger than you realize and braver than you feel.",
            "It's okay to rest. Healing is not linear.",
            "You deserve compassion, especially from yourself.",
            "Your mental health matters and so do you.",
            "You are not broken; you are human.",
            "Every small step forward is progress worth celebrating.",
            "You have the right to take up space and be seen.",
            "Your story matters and your voice deserves to be heard.",
            "You are allowed to change, grow, and become who you're meant to be."
        ];
        
        const affirmationContainer = document.createElement('div');
        affirmationContainer.className = 'affirmation-generator';
        affirmationContainer.innerHTML = `
            <h3>Daily Affirmation</h3>
            <div class="affirmation-text">"${affirmations[Math.floor(Math.random() * affirmations.length)]}"</div>
            <button class="new-affirmation-btn">New Affirmation</button>
        `;
        
        const resourcesSection = document.querySelector('#resources .container');
        if (resourcesSection) {
            resourcesSection.appendChild(affirmationContainer);
        }
        
        document.querySelector('.new-affirmation-btn').addEventListener('click', function() {
            const affirmationText = document.querySelector('.affirmation-text');
            const randomAffirmation = affirmations[Math.floor(Math.random() * affirmations.length)];
            affirmationText.style.opacity = '0';
            setTimeout(() => {
                affirmationText.textContent = `"${randomAffirmation}"`;
                affirmationText.style.opacity = '1';
            }, 300);
        });
    }
    
    function createProgressTracker() {
        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-tracker';
        progressContainer.innerHTML = `
            <h3>Healing Journey Progress</h3>
            <div class="progress-areas">
                <div class="progress-area">
                    <label>Self-Compassion</label>
                    <div class="progress-bar">
                        <div class="progress-fill" data-skill="self-compassion"></div>
                    </div>
                    <div class="progress-buttons">
                        <button onclick="updateProgress('self-compassion', -1)">-</button>
                        <button onclick="updateProgress('self-compassion', 1)">+</button>
                    </div>
                </div>
                <div class="progress-area">
                    <label>Emotional Awareness</label>
                    <div class="progress-bar">
                        <div class="progress-fill" data-skill="emotional-awareness"></div>
                    </div>
                    <div class="progress-buttons">
                        <button onclick="updateProgress('emotional-awareness', -1)">-</button>
                        <button onclick="updateProgress('emotional-awareness', 1)">+</button>
                    </div>
                </div>
                <div class="progress-area">
                    <label>Boundary Setting</label>
                    <div class="progress-bar">
                        <div class="progress-fill" data-skill="boundary-setting"></div>
                    </div>
                    <div class="progress-buttons">
                        <button onclick="updateProgress('boundary-setting', -1)">-</button>
                        <button onclick="updateProgress('boundary-setting', 1)">+</button>
                    </div>
                </div>
                <div class="progress-area">
                    <label>Stress Management</label>
                    <div class="progress-bar">
                        <div class="progress-fill" data-skill="stress-management"></div>
                    </div>
                    <div class="progress-buttons">
                        <button onclick="updateProgress('stress-management', -1)">-</button>
                        <button onclick="updateProgress('stress-management', 1)">+</button>
                    </div>
                </div>
            </div>
            <div class="progress-message"></div>
        `;
        
        const resourcesSection = document.querySelector('#resources .container');
        if (resourcesSection) {
            resourcesSection.appendChild(progressContainer);
        }
        
        loadProgress();
    }
    
    window.updateProgress = function(skill, change) {
        let progress = JSON.parse(localStorage.getItem('healingProgress') || '{}');
        if (!progress[skill]) progress[skill] = 50;
        
        progress[skill] = Math.max(0, Math.min(100, progress[skill] + change * 5));
        localStorage.setItem('healingProgress', JSON.stringify(progress));
        
        loadProgress();
    };
    
    function loadProgress() {
        const progress = JSON.parse(localStorage.getItem('healingProgress') || '{}');
        const progressFills = document.querySelectorAll('.progress-fill');
        
        progressFills.forEach(fill => {
            const skill = fill.dataset.skill;
            const value = progress[skill] || 50;
            fill.style.width = value + '%';
            fill.style.backgroundColor = `hsl(${value * 1.2}, 70%, 50%)`;
        });
        
        const totalProgress = Object.values(progress).reduce((a, b) => a + b, 200) / 4;
        const messageEl = document.querySelector('.progress-message');
        if (messageEl) {
            if (totalProgress < 30) {
                messageEl.innerHTML = '<p>Remember, healing is a journey. Every small step matters. 💚</p>';
            } else if (totalProgress < 60) {
                messageEl.innerHTML = '<p>You\'re making progress! Keep being patient with yourself. 🌱</p>';
            } else if (totalProgress < 80) {
                messageEl.innerHTML = '<p>Great work on your healing journey! Your growth is showing. 🌟</p>';
            } else {
                messageEl.innerHTML = '<p>Amazing progress! You\'re developing real strength and wisdom. 🎉</p>';
            }
        }
    }
    
    createBreathingExercise();
    createMoodTracker();
    createAffirmationGenerator();
    createProgressTracker();
    
    const style = document.createElement('style');
    style.textContent = `
        .breathing-exercise {
            background: white;
            padding: 2rem;
            border-radius: 12px;
            box-shadow: var(--shadow-medium);
            margin: 2rem 0;
            text-align: center;
        }
        
        .breathing-circle {
            width: 150px;
            height: 150px;
            border: 4px solid var(--primary-color);
            border-radius: 50%;
            margin: 0 auto 2rem;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 4s ease-in-out;
            cursor: pointer;
            background: linear-gradient(135deg, var(--light-green), var(--accent-color));
        }
        
        .breathing-text {
            font-weight: 600;
            color: var(--primary-color);
            font-size: 1.1rem;
        }
        
        .breathing-btn {
            background: var(--primary-color);
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 25px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.3s ease;
        }
        
        .breathing-btn:hover {
            background: var(--secondary-color);
        }
        
        .mood-tracker {
            background: white;
            padding: 2rem;
            border-radius: 12px;
            box-shadow: var(--shadow-medium);
            margin: 2rem 0;
            text-align: center;
        }
        
        .mood-tracker h3 {
            color: var(--primary-color);
            margin-bottom: 1.5rem;
        }
        
        .mood-options {
            display: flex;
            justify-content: center;
            gap: 1rem;
            margin-bottom: 1.5rem;
        }
        
        .mood-btn {
            font-size: 2rem;
            border: 2px solid transparent;
            background: none;
            border-radius: 50%;
            width: 60px;
            height: 60px;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .mood-btn:hover {
            transform: scale(1.1);
            border-color: var(--accent-color);
        }
        
        .mood-btn.selected {
            border-color: var(--primary-color);
            background: var(--light-green);
        }
        
        .mood-message {
            min-height: 50px;
            margin-bottom: 1rem;
        }
        
        .mood-message p {
            color: var(--primary-color);
            font-style: italic;
            font-weight: 500;
        }
        
        .mood-chart {
            display: flex;
            gap: 0.5rem;
            justify-content: center;
            flex-wrap: wrap;
        }
        
        .mood-entry {
            text-align: center;
            padding: 0.5rem;
            background: var(--light-green);
            border-radius: 8px;
            min-width: 80px;
        }
        
        .mood-date {
            font-size: 0.8rem;
            color: var(--text-medium);
        }
        
        .mood-emoji {
            font-size: 1.5rem;
        }
        
        .affirmation-generator {
            background: var(--primary-color);
            color: white;
            padding: 2rem;
            border-radius: 12px;
            box-shadow: var(--shadow-medium);
            margin: 2rem 0;
            text-align: center;
        }
        
        .affirmation-generator h3 {
            color: white;
            margin-bottom: 1.5rem;
        }
        
        .affirmation-text {
            font-size: 1.25rem;
            font-style: italic;
            margin-bottom: 2rem;
            min-height: 60px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: opacity 0.3s ease;
        }
        
        .new-affirmation-btn {
            background: white;
            color: var(--primary-color);
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 25px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .new-affirmation-btn:hover {
            background: var(--light-green);
        }
        
        .progress-tracker {
            background: white;
            padding: 2rem;
            border-radius: 12px;
            box-shadow: var(--shadow-medium);
            margin: 2rem 0;
        }
        
        .progress-tracker h3 {
            color: var(--primary-color);
            text-align: center;
            margin-bottom: 2rem;
        }
        
        .progress-area {
            margin-bottom: 1.5rem;
        }
        
        .progress-area label {
            display: block;
            font-weight: 600;
            color: var(--primary-color);
            margin-bottom: 0.5rem;
        }
        
        .progress-bar {
            width: 100%;
            height: 20px;
            background: var(--soft-gray);
            border-radius: 10px;
            overflow: hidden;
            margin-bottom: 0.5rem;
        }
        
        .progress-fill {
            height: 100%;
            background: var(--accent-color);
            border-radius: 10px;
            transition: width 0.5s ease, background-color 0.5s ease;
        }
        
        .progress-buttons {
            display: flex;
            gap: 0.5rem;
            justify-content: center;
        }
        
        .progress-buttons button {
            width: 30px;
            height: 30px;
            border-radius: 50%;
            border: 2px solid var(--primary-color);
            background: white;
            color: var(--primary-color);
            cursor: pointer;
            font-weight: bold;
            transition: all 0.3s ease;
        }
        
        .progress-buttons button:hover {
            background: var(--primary-color);
            color: white;
        }
        
        .progress-message {
            text-align: center;
            margin-top: 2rem;
            font-weight: 500;
        }
        
        .progress-message p {
            color: var(--primary-color);
            font-size: 1.1rem;
        }
        
        @media (max-width: 768px) {
            .mood-options {
                flex-wrap: wrap;
            }
            
            .mood-chart {
                flex-direction: column;
                align-items: center;
            }
        }
    `;
    document.head.appendChild(style);
});
