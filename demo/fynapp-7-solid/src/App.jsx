import { createSignal, createMemo, For } from 'solid-js';
import './styles.css';

// Solid version - hardcoded to match the package dependency
const solidVersion = '1.9.6';

// Card Component
const StatCard = (props) => {
    // Each card will have its own signal for the percentage value
    const [percentage] = createSignal(Math.floor(Math.random() * 20) + 1);

    return (
        <div class="stat-card">
            <div class="stat-header">
                <span class="stat-title">{props.title}</span>
                <span class={`stat-trend ${props.trend}`}>
                    {props.trend === 'up' ? '⬆' : '⬇'} {props.trend === 'up' ? '+' : '-'}{props.randomValue()}%
                </span>
            </div>
            <div class="stat-value">{props.value}</div>
            <div class="stat-desc">{props.desc}</div>
        </div>
    );
};

// Chart Bar Component
const ChartBar = (props) => {
    return <div class="chart-bar" style={{ height: `${props.value}px`, width: `${100 / 10}%` }}></div>;
};

// Project Row Component
const ProjectRow = (props) => {
    const getStatusClass = (status) => {
        switch (status) {
            case 'Completed': return 'completed';
            case 'In Progress': return 'in-progress';
            case 'On Hold': return 'on-hold';
            default: return 'planning';
        }
    };

    const getPriorityClass = (priority) => {
        switch (priority) {
            case 'Critical': return 'critical';
            case 'High': return 'high';
            case 'Medium': return 'medium';
            default: return 'low';
        }
    };

    const getProgressColor = (completion) => {
        if (completion === 100) return '#48bb78';
        if (completion > 50) return '#2D7FF9';
        return '#ecc94b';
    };

    return (
        <div class="project-row">
            <div>{props.project.name}</div>
            <div>
                <span class={`status-badge ${getStatusClass(props.project.status)}`}>
                    {props.project.status}
                </span>
            </div>
            <div>
                <span class={`priority-badge ${getPriorityClass(props.project.priority)}`}>
                    {props.project.priority}
                </span>
            </div>
            <div class="progress-cell">
                <div class="progress-bar">
                    <div
                        class="progress-fill"
                        style={{
                            width: `${props.project.completion}%`,
                            backgroundColor: getProgressColor(props.project.completion)
                        }}
                    ></div>
                </div>
                <span class="progress-text">{props.project.completion}%</span>
            </div>
        </div>
    );
};

// Setting Row Component
const SettingRow = (props) => {
    return (
        <div class="setting-row">
            <div>
                <div class="setting-name">{props.setting.name}</div>
                <div class="setting-desc">{props.setting.description}</div>
            </div>
            <div>
                <button
                    class={`setting-toggle ${props.setting.enabled ? 'enabled' : ''}`}
                    onClick={() => props.onToggle(props.index)}
                >
                    {props.setting.enabled ? 'Enabled' : 'Disabled'}
                </button>
            </div>
        </div>
    );
};

// Main App Component
const App = (props) => {
    const appName = props.appName || 'Solid App';
    const [count, setCount] = createSignal(0);
    const [darkMode, setDarkMode] = createSignal(false);
    const [activeTab, setActiveTab] = createSignal('dashboard');

    // Create a signal for random values that we'll update on increment
    const [randomValue1, setRandomValue1] = createSignal(Math.floor(Math.random() * 20) + 1);
    const [randomValue2, setRandomValue2] = createSignal(Math.floor(Math.random() * 20) + 1);
    const [randomValue3, setRandomValue3] = createSignal(Math.floor(Math.random() * 20) + 1);
    const [randomValue4, setRandomValue4] = createSignal(Math.floor(Math.random() * 20) + 1);

    const [cards] = createSignal([
        { title: "Analytics", value: "85%", trend: "up", desc: "User engagement", randomValue: randomValue1 },
        { title: "Revenue", value: "$12,850", trend: "up", desc: "Monthly revenue", randomValue: randomValue2 },
        { title: "Tickets", value: "23", trend: "down", desc: "Open support tickets", randomValue: randomValue3 },
        { title: "Users", value: "1,293", trend: "up", desc: "Active users", randomValue: randomValue4 }
    ]);

    const [chartData] = createSignal([30, 40, 45, 50, 49, 60, 70, 91, 125, 150]);

    const [projects] = createSignal([
        { id: 1, name: "Website Redesign", status: "In Progress", completion: 65, priority: "High" },
        { id: 2, name: "Mobile App Development", status: "On Hold", completion: 30, priority: "Medium" },
        { id: 3, name: "API Integration", status: "Completed", completion: 100, priority: "High" },
        { id: 4, name: "Database Migration", status: "Planning", completion: 10, priority: "Low" },
        { id: 5, name: "Security Audit", status: "In Progress", completion: 45, priority: "Critical" }
    ]);

    const [settings, setSettings] = createSignal([
        { name: "Notifications", enabled: true, description: "Receive email notifications" },
        { name: "Two-Factor Auth", enabled: false, description: "Add an extra layer of security" },
        { name: "API Access", enabled: true, description: "Allow third-party API access" },
        { name: "Dark Mode", enabled: false, description: "Use dark theme by default" }
    ]);

    const toggleTheme = () => {
        setDarkMode(!darkMode());
    };

    const toggleSetting = (index) => {
        const newSettings = [...settings()];
        newSettings[index].enabled = !newSettings[index].enabled;
        setSettings(newSettings);
    };

    const increment = () => {
        setCount(count() + 1);
        // Update all the random values
        setRandomValue1(Math.floor(Math.random() * 20) + 1);
        setRandomValue2(Math.floor(Math.random() * 20) + 1);
        setRandomValue3(Math.floor(Math.random() * 20) + 1);
        setRandomValue4(Math.floor(Math.random() * 20) + 1);
    };

    return (
        <div class={`solid-app ${darkMode() ? 'dark-mode' : ''}`}>
            <header>
                <div>
                    <h2 class="subtitle">FynApp using Solid.js {solidVersion}</h2>
                    <h1>{appName}</h1>
                </div>
                <div>
                    <button class="theme-toggle" onClick={toggleTheme}>
                        Switch to {darkMode() ? 'Light' : 'Dark'} Mode
                    </button>
                </div>
            </header>

            {/* Tab Navigation */}
            <div class="tab-navigation">
                <For each={['dashboard', 'projects', 'settings']}>
                    {(tab) => (
                        <div
                            onClick={() => setActiveTab(tab)}
                            class={`tab ${activeTab() === tab ? 'active' : ''}`}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </div>
                    )}
                </For>
            </div>

            {/* Dashboard Tab */}
            {activeTab() === 'dashboard' && (
                <>
                    {/* Stats Cards */}
                    <div class="stats-grid">
                        <For each={cards()}>
                            {(card) => (
                                <StatCard
                                    title={card.title}
                                    value={card.value}
                                    trend={card.trend}
                                    desc={card.desc}
                                    randomValue={card.randomValue}
                                />
                            )}
                        </For>
                    </div>

                    {/* Chart Section */}
                    <div class="chart-section">
                        <h3>Performance Metrics</h3>
                        <div class="chart">
                            <For each={chartData()}>
                                {(value) => (
                                    <ChartBar value={value} total={150} />
                                )}
                            </For>
                        </div>
                        <div class="chart-labels">
                            <For each={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']}>
                                {(month) => (
                                    <span>{month}</span>
                                )}
                            </For>
                        </div>
                    </div>

                    {/* Counter Example */}
                    <div class="counter-section">
                        <h3>Interactive Counter</h3>
                        <p>You clicked the button <strong>{count()}</strong> times</p>
                        <button class="primary-button" onClick={increment}>Increment</button>
                    </div>
                </>
            )}

            {/* Projects Tab */}
            {activeTab() === 'projects' && (
                <div class="content-section">
                    <h3>Project Status</h3>

                    <div class="projects-table">
                        <div class="projects-header">
                            <div>Project Name</div>
                            <div>Status</div>
                            <div>Priority</div>
                            <div>Progress</div>
                        </div>

                        <For each={projects()}>
                            {(project) => (
                                <ProjectRow project={project} />
                            )}
                        </For>
                    </div>
                </div>
            )}

            {/* Settings Tab */}
            {activeTab() === 'settings' && (
                <div class="content-section">
                    <h3>Application Settings</h3>

                    <For each={settings()}>
                        {(setting, index) => (
                            <SettingRow
                                setting={setting}
                                index={index()}
                                onToggle={toggleSetting}
                            />
                        )}
                    </For>
                </div>
            )}

            <footer>
                <p>Solid.js Micro Frontend Example | Last updated: {new Date().toLocaleDateString()}</p>
            </footer>
        </div>
    );
};

export default App;