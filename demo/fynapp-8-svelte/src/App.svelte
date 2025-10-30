<script>
  import './styles.css';

  export let appName = "fynapp-8-svelte";

  // Svelte version from package
  const svelteVersion = '4.2.20';

  let count = 0;
  let darkMode = false;
  let activeTab = 'dashboard';

  // Random values for stats cards
  let randomValues = [
    Math.floor(Math.random() * 20) + 1,
    Math.floor(Math.random() * 20) + 1,
    Math.floor(Math.random() * 20) + 1,
    Math.floor(Math.random() * 20) + 1
  ];

  const cards = [
    { title: "Analytics", value: "85%", trend: "up", desc: "User engagement" },
    { title: "Revenue", value: "$12,850", trend: "up", desc: "Monthly revenue" },
    { title: "Tickets", value: "23", trend: "down", desc: "Open support tickets" },
    { title: "Users", value: "1,293", trend: "up", desc: "Active users" }
  ];

  const chartData = [30, 40, 45, 50, 49, 60, 70, 91, 125, 150];
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];

  let projects = [
    { id: 1, name: "Website Redesign", status: "In Progress", completion: 65, priority: "High" },
    { id: 2, name: "Mobile App Development", status: "On Hold", completion: 30, priority: "Medium" },
    { id: 3, name: "API Integration", status: "Completed", completion: 100, priority: "High" },
    { id: 4, name: "Database Migration", status: "Planning", completion: 10, priority: "Low" },
    { id: 5, name: "Security Audit", status: "In Progress", completion: 45, priority: "Critical" }
  ];

  let settings = [
    { name: "Notifications", enabled: true, description: "Receive email notifications" },
    { name: "Two-Factor Auth", enabled: false, description: "Add an extra layer of security" },
    { name: "API Access", enabled: true, description: "Allow third-party API access" },
    { name: "Dark Mode", enabled: false, description: "Use dark theme by default" }
  ];

  function toggleTheme() {
    darkMode = !darkMode;
  }

  function toggleSetting(index) {
    settings[index].enabled = !settings[index].enabled;
    settings = settings; // Trigger reactivity
  }

  function increment() {
    count += 1;
    // Update random values
    randomValues = randomValues.map(() => Math.floor(Math.random() * 20) + 1);
  }

  function getStatusClass(status) {
    const map = {
      'Completed': 'completed',
      'In Progress': 'in-progress',
      'On Hold': 'on-hold',
      'Planning': 'planning'
    };
    return map[status] || 'planning';
  }

  function getPriorityClass(priority) {
    const map = {
      'Critical': 'critical',
      'High': 'high',
      'Medium': 'medium',
      'Low': 'low'
    };
    return map[priority] || 'low';
  }

  function getProgressColor(completion) {
    if (completion === 100) return '#48bb78';
    if (completion > 50) return '#ff3e00';
    return '#ecc94b';
  }
</script>

<div class="svelte-app" class:dark-mode={darkMode}>
  <header>
    <div>
      <h2 class="subtitle">FynApp using Svelte {svelteVersion}</h2>
      <h1>{appName}</h1>
    </div>
    <div>
      <button class="theme-toggle" on:click={toggleTheme}>
        Switch to {darkMode ? 'Light' : 'Dark'} Mode
      </button>
    </div>
  </header>

  <!-- Tab Navigation -->
  <div class="tab-navigation">
    {#each ['dashboard', 'projects', 'settings'] as tab}
      <div
        class="tab"
        class:active={activeTab === tab}
        on:click={() => activeTab = tab}
        on:keydown={(e) => e.key === 'Enter' && (activeTab = tab)}
        role="button"
        tabindex="0"
      >
        {tab.charAt(0).toUpperCase() + tab.slice(1)}
      </div>
    {/each}
  </div>

  <!-- Dashboard Tab -->
  {#if activeTab === 'dashboard'}
    <!-- Stats Cards -->
    <div class="stats-grid">
      {#each cards as card, i}
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-title">{card.title}</span>
            <span class="stat-trend {card.trend}">
              {card.trend === 'up' ? '⬆' : '⬇'}
              {card.trend === 'up' ? '+' : '-'}{randomValues[i]}%
            </span>
          </div>
          <div class="stat-value">{card.value}</div>
          <div class="stat-desc">{card.desc}</div>
        </div>
      {/each}
    </div>

    <!-- Chart Section -->
    <div class="chart-section">
      <h3>Performance Metrics</h3>
      <div class="chart">
        {#each chartData as value}
          <div
            class="chart-bar"
            style="height: {value}px; width: {100 / chartData.length}%;"
          ></div>
        {/each}
      </div>
      <div class="chart-labels">
        {#each monthLabels as month}
          <span>{month}</span>
        {/each}
      </div>
    </div>

    <!-- Counter Example -->
    <div class="counter-section">
      <h3>Interactive Counter</h3>
      <p>You clicked the button <strong>{count}</strong> times</p>
      <button class="primary-button" on:click={increment}>Increment</button>
    </div>
  {/if}

  <!-- Projects Tab -->
  {#if activeTab === 'projects'}
    <div class="content-section">
      <h3>Project Status</h3>

      <div class="projects-table">
        <div class="projects-header">
          <div>Project Name</div>
          <div>Status</div>
          <div>Priority</div>
          <div>Progress</div>
        </div>

        {#each projects as project}
          <div class="project-row">
            <div>{project.name}</div>
            <div>
              <span class="status-badge {getStatusClass(project.status)}">
                {project.status}
              </span>
            </div>
            <div>
              <span class="priority-badge {getPriorityClass(project.priority)}">
                {project.priority}
              </span>
            </div>
            <div class="progress-cell">
              <div class="progress-bar">
                <div
                  class="progress-fill"
                  style="width: {project.completion}%; background-color: {getProgressColor(project.completion)};"
                ></div>
              </div>
              <span class="progress-text">{project.completion}%</span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Settings Tab -->
  {#if activeTab === 'settings'}
    <div class="content-section">
      <h3>Application Settings</h3>

      {#each settings as setting, i}
        <div class="setting-row">
          <div>
            <div class="setting-name">{setting.name}</div>
            <div class="setting-desc">{setting.description}</div>
          </div>
          <div>
            <button
              class="setting-toggle"
              class:enabled={setting.enabled}
              on:click={() => toggleSetting(i)}
            >
              {setting.enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <footer>
    <p>Svelte Micro Frontend Example | Last updated: {new Date().toLocaleDateString()}</p>
  </footer>
</div>
