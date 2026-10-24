import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopNav from './TopNav';

const AppLayout: React.FC = () => {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-main">
        <TopNav />
        <div className="app-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default AppLayout;
