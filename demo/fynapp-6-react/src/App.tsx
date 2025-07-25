import React, { useState } from 'react';
import './styles.css';

interface AppProps {
    appName: string;
    useCounterContext?: () => any;
}

// Card Component
const StatCard: React.FC<{
    title: string;
    value: string;
    trend: 'up' | 'down';
    desc: string;
    refreshKey: number;
}> = ({ title, value, trend, desc, refreshKey }) => {
    const randomPercentage = Math.floor(Math.random() * 20) + 1;

    return (
        <div className="stat-card">
            <div className="stat-header">
                <span className="stat-title">{title}</span>
                <span className={`stat-trend ${trend}`}>
                    {trend === 'up' ? '⬆' : '⬇'} {trend === 'up' ? '+' : '-'}{randomPercentage}%
                </span>
            </div>
            <div className="stat-value">{value}</div>
            <div className="stat-desc">{desc}</div>
        </div>
    );
};

// Chart Bar Component
const ChartBar: React.FC<{
    value: number;
    total: number;
}> = ({ value, total }) => {
    const percentage = (value / total) * 100;
    return <div className="chart-bar" style={{ height: `${value}px`, width: `${100 / 10}%` }}></div>;
};

// Project Row Component
interface Project {
    id: number;
    name: string;
    status: string;
    completion: number;
    priority: string;
}

const ProjectRow: React.FC<{ project: Project }> = ({ project }) => {
    const getStatusClass = (status: string) => {
        switch (status) {
            case 'Completed': return 'completed';
            case 'In Progress': return 'in-progress';
            case 'On Hold': return 'on-hold';
            default: return 'planning';
        }
    };

    const getPriorityClass = (priority: string) => {
        switch (priority) {
            case 'Critical': return 'critical';
            case 'High': return 'high';
            case 'Medium': return 'medium';
            default: return 'low';
        }
    };

    const getProgressColor = (completion: number) => {
        if (completion === 100) return '#48bb78';
        if (completion > 50) return '#6366f1';
        return '#ecc94b';
    };

    return (
        <div className="project-row">
            <div>{project.name}</div>
            <div>
                <span className={`status-badge ${getStatusClass(project.status)}`}>
                    {project.status}
                </span>
            </div>
            <div>
                <span className={`priority-badge ${getPriorityClass(project.priority)}`}>
                    {project.priority}
                </span>
            </div>
            <div className="progress-cell">
                <div className="progress-bar">
                    <div
                        className="progress-fill"
                        style={{
                            width: `${project.completion}%`,
                            backgroundColor: getProgressColor(project.completion)
                        }}
                    ></div>
                </div>
                <span className="progress-text">{project.completion}%</span>
            </div>
        </div>
    );
};

// Setting Row Component
interface Setting {
    name: string;
    enabled: boolean;
    description: string;
}

const SettingRow: React.FC<{
    setting: Setting;
    index: number;
    onToggle: (index: number) => void;
}> = ({ setting, index, onToggle }) => {
    return (
        <div className="setting-row">
            <div>
                <div className="setting-name">{setting.name}</div>
                <div className="setting-desc">{setting.description}</div>
            </div>
            <div>
                <button
                    className={`setting-toggle ${setting.enabled ? 'enabled' : ''}`}
                    onClick={() => onToggle(index)}
                >
                    {setting.enabled ? 'Enabled' : 'Disabled'}
                </button>
            </div>
        </div>
    );
};

// Main App Component
const App: React.FC<AppProps> = ({ appName = 'React App', useCounterContext }) => {
    const [count, setCount] = useState(0);
    const [darkMode, setDarkMode] = useState(false);
    const [activeTab, setActiveTab] = useState('dashboard');

    // Use the context hook directly at component level if available
    const counterContext = useCounterContext ? useCounterContext() : null;
    const contextAvailable = !!counterContext;

    // Extract state and actions from context
    const sharedCounter = counterContext?.state || { count: 0 };
    const sharedCounterActions = counterContext?.actions || {};

    console.log('🔍 fynapp-6-react App: Context available:', contextAvailable);
    console.log('🔍 fynapp-6-react App: Counter state:', sharedCounter);
    console.log('🔍 fynapp-6-react App: Available actions:', Object.keys(sharedCounterActions));

    const [cards] = useState([
        { title: "Analytics", value: "85%", trend: "up" as const, desc: "User engagement" },
        { title: "Revenue", value: "$12,850", trend: "up" as const, desc: "Monthly revenue" },
        { title: "Tickets", value: "23", trend: "down" as const, desc: "Open support tickets" },
        { title: "Users", value: "1,293", trend: "up" as const, desc: "Active users" }
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

    const toggleSetting = (index: number) => {
        const newSettings = [...settings];
        newSettings[index].enabled = !newSettings[index].enabled;
        setSettings(newSettings);
    };

    const increment = () => {
        setCount(count + 1);
    };

    return (
        <div className={`react-app ${darkMode ? 'dark-mode' : ''}`}>
            <header>
                <div>
                    <h2 className="subtitle">FynApp using React {React.version}</h2>
                    <h1>{appName}</h1>
                </div>
                <div>
                    <button className="theme-toggle" onClick={toggleTheme}>
                        Switch to {darkMode ? 'Light' : 'Dark'} Mode
                    </button>
                </div>
            </header>

            {/* Tab Navigation */}
            <div className="tab-navigation">
                {['dashboard', 'projects', 'settings'].map(tab => (
                    <div
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`tab ${activeTab === tab ? 'active' : ''}`}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </div>
                ))}
            </div>

            {/* Main Content Area */}
            <div className="main-content">
                {/* Dashboard Tab */}
                {activeTab === 'dashboard' && (
                    <>
                        {/* Stats Cards */}
                        <div className="stats-grid">
                            {cards.map((card, index) => (
                                <StatCard
                                    key={index}
                                    title={card.title}
                                    value={card.value}
                                    trend={card.trend}
                                    desc={card.desc}
                                    refreshKey={count}
                                />
                            ))}
                        </div>

                        {/* Chart Section */}
                        <div className="chart-section">
                            <h3>Performance Metrics</h3>
                            <div className="chart">
                                {chartData.map((value, index) => (
                                    <ChartBar key={index} value={value} total={150} />
                                ))}
                            </div>
                            <div className="chart-labels">
                                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'].map(month => (
                                    <span key={month}>{month}</span>
                                ))}
                            </div>
                        </div>

                        {/* Shared Counter Example */}
                        <div className="counter-section">
                            <h3>🔗 Cross-App Shared Counter</h3>
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{
                                    fontSize: '48px',
                                    fontWeight: 'bold',
                                    textAlign: 'center',
                                    margin: '20px 0',
                                    color: darkMode ? '#63b3ed' : '#3182ce'
                                }}>
                                    {sharedCounter.count}
                                </div>
                                <p style={{
                                    color: darkMode ? '#a0aec0' : '#718096',
                                    textAlign: 'center',
                                    marginBottom: '16px'
                                }}>
                                    Shared with fynapp-1 & fynapp-1-b! Status: {' '}
                                    <span style={{
                                        color: contextAvailable ? '#48bb78' : '#f56565',
                                        fontWeight: 'bold'
                                    }}>
                                        {contextAvailable ? '✅ Connected' : '❌ Not Connected'}
                                    </span>
                                    <br />
                                    <small>Updates instantly across all apps!</small>
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '20px' }}>
                                <button
                                    className="primary-button"
                                    onClick={() => {
                                        console.log('🔍 fynapp-6-react: Incrementing shared counter...');
                                        if (sharedCounterActions.increment) {
                                            sharedCounterActions.increment();
                                            console.log('✅ fynapp-6-react: Shared counter incremented');
                                        } else {
                                            console.error('❌ fynapp-6-react: increment action not available');
                                        }
                                    }}
                                >
                                    + Increment (Cross-App)
                                </button>
                                <button
                                    className="primary-button"
                                    onClick={() => {
                                        console.log('🔍 fynapp-6-react: Resetting shared counter...');
                                        if (sharedCounterActions.reset) {
                                            sharedCounterActions.reset();
                                            console.log('✅ fynapp-6-react: Shared counter reset');
                                        } else {
                                            console.error('❌ fynapp-6-react: reset action not available');
                                        }
                                    }}
                                    style={{ backgroundColor: '#e53e3e' }}
                                >
                                    Reset
                                </button>
                            </div>
                            <hr style={{ margin: '20px 0', opacity: 0.3 }} />
                            <div>
                                <h4>Local Counter (fynapp-6 only)</h4>
                                <p>You clicked the local button <strong>{count}</strong> times</p>
                                <button className="primary-button" onClick={increment}>Increment Local</button>
                            </div>
                        </div>
                    </>
                )}

                {/* Projects Tab */}
                {activeTab === 'projects' && (
                    <div className="content-section">
                        <h3>Project Status</h3>

                        <div className="projects-table">
                            <div className="projects-header">
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
                    <div className="content-section">
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
            </div>

            <footer>
                <p>React Micro Frontend Example | Last updated: {new Date().toLocaleDateString()}</p>
            </footer>
        </div>
    );
};

export default App;
