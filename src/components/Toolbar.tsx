import type { Component, Accessor } from 'solid-js';

interface ToolbarProps {
  sidebarOpen: Accessor<boolean>;
  setSidebarOpen: (open: boolean) => void;
  activeTab: Accessor<'stats' | 'sql'>;
  setActiveTab: (tab: 'stats' | 'sql') => void;
  rowCount: Accessor<number>;
  colCount: Accessor<number>;
  onImportMock: () => void;
  canUndo: Accessor<boolean>;
  canRedo: Accessor<boolean>;
  onUndo: () => void;
  onRedo: () => void;
}

export const Toolbar: Component<ToolbarProps> = (props) => {
  return (
    <header class="toolbar">
      <div class="toolbar-left">
        <div class="brand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          </svg>
          <span>zen-tabo</span>
        </div>
        <div class="status-badge">
          <span class="status-dot"></span>
          <span>WASM Engine Active</span>
        </div>
        <div class="status-badge" style="background: rgba(150, 60, 55, 0.08); border-color: rgba(150, 60, 55, 0.2); color: var(--text-accent);">
          <span>SharedArrayBuffer ON</span>
        </div>
      </div>
      
      <div class="toolbar-right">
        <button 
          class="toolbar-btn" 
          disabled={!props.canUndo()}
          onClick={props.onUndo}
          title="Undo (Ctrl+Z)"
          style={{ opacity: props.canUndo() ? 1 : 0.4, cursor: props.canUndo() ? 'pointer' : 'not-allowed' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
          Undo
        </button>

        <button 
          class="toolbar-btn" 
          disabled={!props.canRedo()}
          onClick={props.onRedo}
          title="Redo (Ctrl+Y)"
          style={{ opacity: props.canRedo() ? 1 : 0.4, cursor: props.canRedo() ? 'pointer' : 'not-allowed' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/>
          </svg>
          Redo
        </button>

        <div class="toolbar-divider" style="width: 1px; height: 16px; background: rgba(255,255,255,0.1); margin: 0 8px;"></div>

        <button 
          class="toolbar-btn" 
          onClick={props.onImportMock}
          title="Load 1,000,000 cells dataset for benchmarking"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Load 1M Cells
        </button>

        <button 
          class={`toolbar-btn ${props.sidebarOpen() && props.activeTab() === 'stats' ? 'active' : ''}`}
          onClick={() => {
            if (props.sidebarOpen() && props.activeTab() === 'stats') {
              props.setSidebarOpen(false);
            } else {
              props.setActiveTab('stats');
              props.setSidebarOpen(true);
            }
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
          Analytics
        </button>

        <button 
          class={`toolbar-btn ${props.sidebarOpen() && props.activeTab() === 'sql' ? 'active' : ''}`}
          onClick={() => {
            if (props.sidebarOpen() && props.activeTab() === 'sql') {
              props.setSidebarOpen(false);
            } else {
              props.setActiveTab('sql');
              props.setSidebarOpen(true);
            }
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 17 10 11 15 16 20 9"/>
            <path d="M20 9h-4"/>
            <path d="M20 9v4"/>
          </svg>
          SQL Console
        </button>
      </div>
    </header>
  );
};
