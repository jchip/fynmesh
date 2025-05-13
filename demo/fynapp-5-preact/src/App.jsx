import { h, Fragment, options } from 'preact';
import { useState } from 'preact/hooks';
import './styles.css';

// Card Component
const StatCard = ({ title, value, trend, desc }) => {
    const randomPercentage = Math.floor(Math.random() * 20) + 1;

    return (
        <div class="stat-card">
            <div class="stat-header">
                <span class="stat-title">{title}</span>
                <span class={`stat-trend ${trend}`}>
                    {trend === 'up' ? '⬆' : '⬇'} {trend === 'up' ? '+' : '-'}{randomPercentage}%
                </span>
            </div>
            <div class="stat-value">{value}</div>
            <div class="stat-desc">{desc}</div>
        </div>
    );
};

// Chart Bar Component
const ChartBar = ({ value, total }) => {
    const percentage = (value / total) * 100;
    return <div class="chart-bar" style={{ height: `${value}px`, width: `${100 / 10}%` }}></div>;
};

// Project Row Component
const ProjectRow = ({ project }) => {
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
        if (completion > 50) return '#4299e1';
        return '#ecc94b';
    };

    return (
        <div class="project-row">
            <div>{project.name}</div>
            <div>
                <span class={`status-badge ${getStatusClass(project.status)}`}>
                    {project.status}
                </span>
            </div>
            <div>
                <span class={`priority-badge ${getPriorityClass(project.priority)}`}>
                    {project.priority}
                </span>
            </div>
            <div class="progress-cell">
                <div class="progress-bar">
                    <div
                        class="progress-fill"
                        style={{
                            width: `${project.completion}%`,
                            backgroundColor: getProgressColor(project.completion)
                        }}
                    ></div>
                </div>
                <span class="progress-text">{project.completion}%</span>
            </div>
        </div>
    );
};

// Setting Row Component
const SettingRow = ({ setting, index, onToggle }) => {
    return (
        <div class="setting-row">
            <div>
                <div class="setting-name">{setting.name}</div>
                <div class="setting-desc">{setting.description}</div>
            </div>
            <div>
                <button
                    class={`setting-toggle ${setting.enabled ? 'enabled' : ''}`}
                    onClick={() => onToggle(index)}
                >
                    {setting.enabled ? 'Enabled' : 'Disabled'}
                </button>
            </div>
        </div>
    );
};

// Main App Component
const App = ({ appName = 'Preact App' }) => {
    const [count, setCount] = useState(0);
    const [darkMode, setDarkMode] = useState(false);
    const [activeTab, setActiveTab] = useState('dashboard');

    const [cards] = useState([
        { title: "Analytics", value: "85%", trend: "up", desc: "User engagement" },
        { title: "Revenue", value: "$12,850", trend: "up", desc: "Monthly revenue" },
        { title: "Tickets", value: "23", trend: "down", desc: "Open support tickets" },
        { title: "Users", value: "1,293", trend: "up", desc: "Active users" }
    ]);

    const [chartData] = useState([30, 40, 45, 50, 49, 60, 70, 91, 125, 150]);

    const [projects] = useState([
        { id: 1, name: "Website Redesign", status: "In Progress", completion: 65, priority: "High" },
        { id: 2, name: "Mobile App Development", status: "On Hold", completion: 30, priority: "Medium" },
        { id: 3, name: "API Integration", status: "Completed", completion: 100, priority: "High" },
        { id: 4, name: "Database Migration", status: "Planning", completion: 10, priority: "Low" },
        { id: 5, name: "Security Audit", status: "In Progress", completion: 45, priority: "Critical" }
    ]);

    const [settings, setSettings] = useState([
        { name: "Notifications", enabled: true, description: "Receive email notifications" },
        { name: "Two-Factor Auth", enabled: false, description: "Add an extra layer of security" },
        { name: "API Access", enabled: true, description: "Allow third-party API access" },
        { name: "Dark Mode", enabled: false, description: "Use dark theme by default" }
    ]);

    const toggleTheme = () => {
        setDarkMode(!darkMode);
    };

    const toggleSetting = (index) => {
        const newSettings = [...settings];
        newSettings[index].enabled = !newSettings[index].enabled;
        setSettings(newSettings);
    };

    const increment = () => {
        setCount(count + 1);
    };

    return (
        <div class={`preact-app ${darkMode ? 'dark-mode' : ''}`}>
            <header>
                <div>
                    <h2 class="subtitle">FynApp using Preact {options.versionPrefix || '10.x'}</h2>
                    <h1>{appName}</h1>
                </div>
                <div>
                    <button class="theme-toggle" onClick={toggleTheme}>
                        Switch to {darkMode ? 'Light' : 'Dark'} Mode
                    </button>
                </div>
            </header>

            {/* Tab Navigation */}
            <div class="tab-navigation">
                {['dashboard', 'projects', 'settings'].map(tab => (
                    <div
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        class={`tab ${activeTab === tab ? 'active' : ''}`}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </div>
                ))}
            </div>

            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && (
                <>
                    {/* Stats Cards */}
                    <div class="stats-grid">
                        {cards.map((card, index) => (
                            <StatCard
                                key={index}
                                title={card.title}
                                value={card.value}
                                trend={card.trend}
                                desc={card.desc}
                            />
                        ))}
                    </div>

                    {/* Chart Section */}
                    <div class="chart-section">
                        <h3>Performance Metrics</h3>
                        <div class="chart">
                            {chartData.map((value, index) => (
                                <ChartBar key={index} value={value} total={150} />
                            ))}
                        </div>
                        <div class="chart-labels">
                            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'].map(month => (
                                <span key={month}>{month}</span>
                            ))}
                        </div>
                    </div>

                    {/* Counter Example */}
                    <div class="counter-section">
                        <h3>Interactive Counter</h3>
                        <p>You clicked the button <strong>{count}</strong> times</p>
                        <button class="primary-button" onClick={increment}>Increment</button>
                    </div>
                </>
            )}

            {/* Projects Tab */}
            {activeTab === 'projects' && (
                <div class="content-section">
                    <h3>Project Status</h3>

                    <div class="projects-table">
                        <div class="projects-header">
                            <div>Project Name</div>
                            <div>Status</div>
                            <div>Priority</div>
                            <div>Progress</div>
                        </div>

                        {projects.map(project => (
                            <ProjectRow key={project.id} project={project} />
                        ))}
                    </div>
                </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
                <div class="content-section">
                    <h3>Application Settings</h3>

                    {settings.map((setting, index) => (
                        <SettingRow
                            key={index}
                            setting={setting}
                            index={index}
                            onToggle={toggleSetting}
                        />
                    ))}
                </div>
            )}

            <footer>
                <p>Preact Micro Frontend Example | Last updated: {new Date().toLocaleDateString()}</p>
            </footer>
        </div>
    );
};

export default App;