import { useState } from 'react';
import { Header } from './Header';
import { DatabaseCreator } from './DatabaseCreator';
import { DatabaseManager } from './DatabaseManager';
import '../styles/DatabaseApp.css';

export function DatabaseApp() {
  const [activeTab, setActiveTab] = useState<'create' | 'manage'>('create');

  return (
    <div className="database-app">
      <Header />
      <main className="database-main">
        <div className="tab-navigation">
          <nav className="tab-nav">
            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className={`tab-button ${activeTab === 'create' ? 'active' : 'inactive'}`}
            >
              Create Database
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('manage')}
              className={`tab-button ${activeTab === 'manage' ? 'active' : 'inactive'}`}
            >
              Manage Database
            </button>
          </nav>
        </div>

        {activeTab === 'create' ? <DatabaseCreator /> : <DatabaseManager />}
      </main>
    </div>
  );
}
