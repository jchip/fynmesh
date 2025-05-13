<template>
  <div class="vue-app" :class="{ 'dark-mode': darkMode }">
    <header>
      <div>
        <h2 class="subtitle">FynApp using Vue {{ vueVersion }}</h2>
        <h1>{{ appName }}</h1>
      </div>
      <div>
        <button class="theme-toggle" @click="toggleTheme">
          Switch to {{ darkMode ? 'Light' : 'Dark' }} Mode
        </button>
      </div>
    </header>

    <!-- Tab Navigation -->
    <div class="tab-navigation">
      <div
        v-for="tab in ['dashboard', 'projects', 'settings']"
        :key="tab"
        @click="activeTab = tab"
        :class="['tab', { active: activeTab === tab }]"
      >
        {{ tab.charAt(0).toUpperCase() + tab.slice(1) }}
      </div>
    </div>

    <!-- Dashboard Tab -->
    <div v-if="activeTab === 'dashboard'">
      <!-- Stats Cards -->
      <div class="stats-grid">
        <div v-for="(card, index) in cards" :key="index" class="stat-card">
          <div class="stat-header">
            <span class="stat-title">{{ card.title }}</span>
            <span class="stat-trend" :class="card.trend">
              {{ card.trend === 'up' ? '⬆' : '⬇' }}
              {{ card.trend === 'up' ? '+' : '-' }}{{ Math.floor(Math.random() * 20) + 1 }}%
            </span>
          </div>
          <div class="stat-value">{{ card.value }}</div>
          <div class="stat-desc">{{ card.desc }}</div>
        </div>
      </div>

      <!-- Chart Section -->
      <div class="chart-section">
        <h3>Performance Metrics</h3>
        <div class="chart">
          <div
            v-for="(value, index) in chartData"
            :key="index"
            class="chart-bar"
            :style="{
              height: `${value}px`,
              width: `${100 / chartData.length}%`
            }"
          ></div>
        </div>
        <div class="chart-labels">
          <span v-for="month in ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']" :key="month">
            {{ month }}
          </span>
        </div>
      </div>

      <!-- Counter Example -->
      <div class="counter-section">
        <h3>Interactive Counter</h3>
        <p>You clicked the button <strong>{{ count }}</strong> times</p>
        <button class="primary-button" @click="count++">Increment</button>
      </div>
    </div>

    <!-- Projects Tab -->
    <div v-if="activeTab === 'projects'" class="content-section">
      <h3>Project Status</h3>

      <div class="projects-table">
        <div class="projects-header">
          <div>Project Name</div>
          <div>Status</div>
          <div>Priority</div>
          <div>Progress</div>
        </div>

        <div v-for="project in projects" :key="project.id" class="project-row">
          <div>{{ project.name }}</div>
          <div>
            <span class="status-badge" :class="getStatusClass(project.status)">
              {{ project.status }}
            </span>
          </div>
          <div>
            <span class="priority-badge" :class="getPriorityClass(project.priority)">
              {{ project.priority }}
            </span>
          </div>
          <div class="progress-cell">
            <div class="progress-bar">
              <div
                class="progress-fill"
                :style="{
                  width: `${project.completion}%`,
                  backgroundColor: getProgressColor(project.completion)
                }"
              ></div>
            </div>
            <span class="progress-text">{{ project.completion }}%</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Settings Tab -->
    <div v-if="activeTab === 'settings'" class="content-section">
      <h3>Application Settings</h3>

      <div v-for="(setting, index) in settings" :key="index" class="setting-row">
        <div>
          <div class="setting-name">{{ setting.name }}</div>
          <div class="setting-desc">{{ setting.description }}</div>
        </div>
        <div>
          <button
            class="setting-toggle"
            :class="{ enabled: setting.enabled }"
            @click="toggleSetting(index)"
          >
            {{ setting.enabled ? 'Enabled' : 'Disabled' }}
          </button>
        </div>
      </div>
    </div>

    <footer>
      <p>Vue.js Micro Frontend Example | Last updated: {{ new Date().toLocaleDateString() }}</p>
    </footer>
  </div>
</template>

<script>
// Hardcoded version to match the package dependency
const vueVersion = '3.3.4';

export default {
  name: 'App',
  props: {
    appName: {
      type: String,
      default: 'Vue App'
    }
  },
  data() {
    return {
      count: 0,
      darkMode: false,
      activeTab: 'dashboard',
      vueVersion,
      cards: [
        { title: "Analytics", value: "85%", trend: "up", desc: "User engagement" },
        { title: "Revenue", value: "$12,850", trend: "up", desc: "Monthly revenue" },
        { title: "Tickets", value: "23", trend: "down", desc: "Open support tickets" },
        { title: "Users", value: "1,293", trend: "up", desc: "Active users" }
      ],
      chartData: [30, 40, 45, 50, 49, 60, 70, 91, 125, 150],
      projects: [
        { id: 1, name: "Website Redesign", status: "In Progress", completion: 65, priority: "High" },
        { id: 2, name: "Mobile App Development", status: "On Hold", completion: 30, priority: "Medium" },
        { id: 3, name: "API Integration", status: "Completed", completion: 100, priority: "High" },
        { id: 4, name: "Database Migration", status: "Planning", completion: 10, priority: "Low" },
        { id: 5, name: "Security Audit", status: "In Progress", completion: 45, priority: "Critical" }
      ],
      settings: [
        { name: "Notifications", enabled: true, description: "Receive email notifications" },
        { name: "Two-Factor Auth", enabled: false, description: "Add an extra layer of security" },
        { name: "API Access", enabled: true, description: "Allow third-party API access" },
        { name: "Dark Mode", enabled: false, description: "Use dark theme by default" }
      ]
    }
  },
  methods: {
    toggleTheme() {
      this.darkMode = !this.darkMode;
    },
    toggleSetting(index) {
      this.settings[index].enabled = !this.settings[index].enabled;
    },
    getStatusClass(status) {
      switch(status) {
        case 'Completed': return 'completed';
        case 'In Progress': return 'in-progress';
        case 'On Hold': return 'on-hold';
        default: return 'planning';
      }
    },
    getPriorityClass(priority) {
      switch(priority) {
        case 'Critical': return 'critical';
        case 'High': return 'high';
        case 'Medium': return 'medium';
        default: return 'low';
      }
    },
    getProgressColor(completion) {
      if (completion === 100) return '#48bb78';
      if (completion > 50) return '#4299e1';
      return '#ecc94b';
    }
  }
}
</script>

<style>
.vue-app {
  font-family: sans-serif;
  padding: 20px;
  background-color: #f7fafc;
  color: #2d3748;
  border-radius: 8px;
  max-width: 800px;
  margin: 0 auto;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.vue-app.dark-mode {
  background-color: #1a202c;
  color: #f7fafc;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.subtitle {
  color: #4a5568;
  margin: 0;
  font-size: 16px;
  opacity: 0.8;
  margin-bottom: 4px;
}

.dark-mode .subtitle {
  color: #90cdf4;
}

h1 {
  color: #3182ce;
  margin: 0;
}

.dark-mode h1 {
  color: #90cdf4;
}

h3 {
  margin-top: 0;
  margin-bottom: 16px;
}

.theme-toggle {
  background-color: #e2e8f0;
  color: #2d3748;
  border: none;
  padding: 8px 15px;
  border-radius: 4px;
  cursor: pointer;
}

.dark-mode .theme-toggle {
  background-color: #4a5568;
  color: white;
}

.tab-navigation {
  margin-bottom: 24px;
  border-bottom: 1px solid rgba(160, 174, 192, 0.3);
  display: flex;
}

.tab {
  padding: 12px 16px;
  cursor: pointer;
  color: #718096;
}

.dark-mode .tab {
  color: #A0AEC0;
}

.tab.active {
  color: #3182ce;
  border-bottom: 2px solid #3182ce;
}

.dark-mode .tab.active {
  color: #90cdf4;
  border-bottom: 2px solid #90cdf4;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background-color: white;
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

.dark-mode .stat-card {
  background-color: #2d3748;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
}

.stat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.stat-title {
  font-size: 14px;
  opacity: 0.8;
}

.stat-trend {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 12px;
}

.stat-trend.up {
  color: #48bb78;
  background: rgba(72, 187, 120, 0.1);
}

.stat-trend.down {
  color: #f56565;
  background: rgba(245, 101, 101, 0.1);
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 4px;
}

.stat-desc {
  font-size: 12px;
  opacity: 0.7;
}

.content-section,
.chart-section,
.counter-section {
  background-color: white;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 24px;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

.dark-mode .content-section,
.dark-mode .chart-section,
.dark-mode .counter-section {
  background-color: #2d3748;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
}

.chart {
  height: 150px;
  display: flex;
  align-items: flex-end;
  gap: 4px;
}

.chart-bar {
  background: linear-gradient(to top, #4299e1, #90cdf4);
  border-radius: 4px 4px 0 0;
}

.dark-mode .chart-bar {
  background: linear-gradient(to top, #3182ce, #63b3ed);
}

.chart-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.7;
}

.primary-button {
  background-color: #3182ce;
  color: white;
  border: none;
  padding: 8px 15px;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 10px;
}

.dark-mode .primary-button {
  background-color: #4299e1;
}

.projects-table {
  border-radius: 6px;
  overflow: hidden;
}

.projects-header {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  background-color: #e2e8f0;
  padding: 12px 16px;
  font-weight: bold;
  font-size: 14px;
}

.dark-mode .projects-header {
  background-color: #4a5568;
}

.project-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
}

.dark-mode .project-row {
  border-bottom: 1px solid #4a5568;
}

.status-badge,
.priority-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 12px;
}

.status-badge.completed {
  background-color: #48bb78;
  color: white;
}

.status-badge.in-progress {
  background-color: #4299e1;
  color: white;
}

.status-badge.on-hold {
  background-color: #ecc94b;
  color: #744210;
}

.status-badge.planning {
  background-color: #a0aec0;
  color: white;
}

.priority-badge.critical {
  background-color: #f56565;
  color: white;
}

.priority-badge.high {
  background-color: #ed8936;
  color: white;
}

.priority-badge.medium {
  background-color: #ecc94b;
  color: #744210;
}

.priority-badge.low {
  background-color: #a0aec0;
  color: white;
}

.progress-cell {
  display: flex;
  align-items: center;
}

.progress-bar {
  flex-grow: 1;
  height: 8px;
  background-color: #e2e8f0;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
}

.progress-text {
  margin-left: 8px;
  font-size: 12px;
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid rgba(160, 174, 192, 0.3);
}

.setting-name {
  font-weight: bold;
  margin-bottom: 4px;
}

.setting-desc {
  font-size: 14px;
  opacity: 0.7;
}

.setting-toggle {
  background-color: #e2e8f0;
  color: #718096;
  border: none;
  padding: 8px 15px;
  border-radius: 4px;
  cursor: pointer;
}

.dark-mode .setting-toggle {
  background-color: #4a5568;
  color: #a0aec0;
}

.setting-toggle.enabled {
  background-color: #3182ce;
  color: white;
}

.dark-mode .setting-toggle.enabled {
  background-color: #4299e1;
}

footer {
  font-size: 12px;
  opacity: 0.7;
  text-align: center;
  margin-top: 20px;
}
</style>