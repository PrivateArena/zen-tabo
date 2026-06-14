import { For, Show } from 'solid-js';
import type { Component, Accessor } from 'solid-js';

export interface ColumnStats {
  columnName: string;
  count: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  histogram: number[];
}

export interface SQLResult {
  columns: string[];
  rows: any[][];
  errorMessage?: string;
  executionTimeMs?: number;
}

interface SidebarProps {
  activeTab: Accessor<'stats' | 'sql'>;
  setActiveTab: (tab: 'stats' | 'sql') => void;
  stats: Accessor<ColumnStats | null>;
  sqlQuery: Accessor<string>;
  setSqlQuery: (q: string) => void;
  onRunSQL: () => void;
  sqlResult: Accessor<SQLResult | null>;
}

export const Sidebar: Component<SidebarProps> = (props) => {
  const getHistogramMax = (hist: number[]) => {
    return Math.max(...hist, 1);
  };

  return (
    <aside class="sidebar-dock">
      <div class="sidebar-header">
        <span class="sidebar-title">
          {props.activeTab() === 'stats' ? 'Analytics Inspector' : 'DuckDB Analytical SQL'}
        </span>
      </div>

      <div class="sidebar-tabs">
        <button 
          class={`sidebar-tab ${props.activeTab() === 'stats' ? 'active' : ''}`}
          onClick={() => props.setActiveTab('stats')}
        >
          Column Stats
        </button>
        <button 
          class={`sidebar-tab ${props.activeTab() === 'sql' ? 'active' : ''}`}
          onClick={() => props.setActiveTab('sql')}
        >
          SQL Prompt
        </button>
      </div>

      <div class="sidebar-content">
        <Show when={props.activeTab() === 'stats'}>
          <Show 
            when={props.stats()} 
            fallback={
              <div style="color: var(--text-muted); text-align: center; margin-top: 40px; font-size: 0.85rem;">
                Select a numeric column to view real-time vectorized summary.
              </div>
            }
          >
            {(currentStats) => (
              <div style="display: flex; flex-direction: column; gap: 16px;">
                <div>
                  <div class="stats-section-title">
                    <span>Target Column</span>
                    <span style="color: var(--text-accent);">{currentStats().columnName}</span>
                  </div>
                  <div class="stats-card">
                    <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-secondary);">
                      <span>Total Sample Rows:</span>
                      <strong style="color: var(--text-primary);">{currentStats().count.toLocaleString()}</strong>
                    </div>
                  </div>
                </div>

                <div>
                  <div class="stats-section-title">Welford's Single-Pass Metrics</div>
                  <div class="stats-grid">
                    <div class="stat-item">
                      <div class="stat-label">Mean (Average)</div>
                      <div class="stat-value accent">{currentStats().mean.toFixed(2)}</div>
                    </div>
                    <div class="stat-item">
                      <div class="stat-label">Median (O(N) Select)</div>
                      <div class="stat-value">{currentStats().median.toFixed(2)}</div>
                    </div>
                    <div class="stat-item">
                      <div class="stat-label">Std Deviation</div>
                      <div class="stat-value">{currentStats().stdDev.toFixed(2)}</div>
                    </div>
                    <div class="stat-item">
                      <div class="stat-label">Min / Max Bounds</div>
                      <div class="stat-value" style="font-size: 0.78rem; white-space: nowrap;">
                        {currentStats().min.toFixed(1)} / {currentStats().max.toFixed(1)}
                      </div>
                    </div>
                  </div>
                </div>

                <div class="histogram-container">
                  <div class="stats-section-title">Distribution Histogram</div>
                  <div class="histogram-bars">
                    <For each={currentStats().histogram}>
                      {(value, idx) => {
                        const pct = () => (value / getHistogramMax(currentStats().histogram)) * 100;
                        const binMin = () => currentStats().min + (idx() * (currentStats().max - currentStats().min) / 10);
                        const binMax = () => currentStats().min + ((idx() + 1) * (currentStats().max - currentStats().min) / 10);
                        return (
                          <div class="histogram-bar-wrapper">
                            <div 
                              class="histogram-bar" 
                              style={{ height: `${pct()}%` }}
                            ></div>
                            <div class="histogram-tooltip">
                              Range: {binMin().toFixed(1)} - {binMax().toFixed(1)}<br/>
                              Count: {value} ({((value / currentStats().count) * 100).toFixed(1)}%)
                            </div>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                  <div class="histogram-labels">
                    <span>{currentStats().min.toFixed(1)}</span>
                    <span>{((currentStats().min + currentStats().max) / 2).toFixed(1)}</span>
                    <span>{currentStats().max.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            )}
          </Show>
        </Show>

        <Show when={props.activeTab() === 'sql'}>
          <div class="sql-console">
            <div class="stats-section-title">
              <span>SQL Query (DuckDB Engine)</span>
            </div>
            <div class="sql-editor-container">
              <textarea
                class="sql-textarea"
                value={props.sqlQuery()}
                onInput={(e) => props.setSqlQuery(e.currentTarget.value)}
                placeholder="SELECT Region, SUM(Revenue) FROM active_sheet GROUP BY Region;"
              />
            </div>
            <div class="sql-actions">
              <button class="sql-btn" onClick={props.onRunSQL}>
                Execute Query
              </button>
            </div>

            <div class="stats-section-title">
              <span>Execution Output</span>
              <Show when={props.sqlResult() && props.sqlResult()?.executionTimeMs !== undefined}>
                <span style="color: var(--text-muted); font-size: 0.7rem; font-family: var(--font-mono);">
                  {props.sqlResult()?.executionTimeMs?.toFixed(1)}ms
                </span>
              </Show>
            </div>
            
            <div class="sql-results">
              <Show 
                when={props.sqlResult()} 
                fallback={
                  <div style="color: var(--text-muted); text-align: center; padding: 20px; font-size: 0.8rem;">
                    Run a query to view results. Query table name: 'active_sheet'
                  </div>
                }
              >
                {(res) => (
                  <Show 
                    when={!res().errorMessage} 
                    fallback={
                      <div style="color: hsl(0, 70%, 60%); font-family: var(--font-mono); font-size: 0.75rem; white-space: pre-wrap; padding: 4px;">
                        Error: {res().errorMessage}
                      </div>
                    }
                  >
                    <table class="sql-results-table">
                      <thead>
                        <tr>
                          <For each={res().columns}>
                            {(col) => <th>{col}</th>}
                          </For>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={res().rows}>
                          {(row) => (
                            <tr>
                              <For each={row}>
                                {(cell) => <td>{cell !== null && cell !== undefined ? String(cell) : 'NULL'}</td>}
                              </For>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </Show>
                )}
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </aside>
  );
};
