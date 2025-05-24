import React from 'react';

// Note: You may need to add the following to your global CSS:
// .app-region-drag { -webkit-app-region: drag; }
// .app-region-no-drag { -webkit-app-region: no-drag; }

const CustomTitleBar: React.FC = () => {
  return (
    <div className="app-region-drag flex h-10 items-center gap-3 rounded-t-lg bg-[#f6faff] px-4 shadow-sm select-none">
      <button className="record-btn app-region-no-drag mr-2 border-none bg-none p-0">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="8" cy="8" r="8" fill="#2563eb" />
          <rect x="6" y="4" width="4" height="8" rx="2" fill="white" />
        </svg>
      </button>
      <span className="mr-4 text-base text-slate-700">00:00</span>
      <div className="flex-1" />
      <button className="app-region-no-drag flex items-center border-none bg-none px-2 py-1 text-slate-700">
        Ask AI
      </button>
      <span className="shortcut app-region-no-drag mx-1 text-xs text-slate-400">
        ⌘↵
      </span>
      <button className="app-region-no-drag flex items-center border-none bg-none px-2 py-1 text-slate-700">
        Show/Hide
      </button>
      <span className="shortcut app-region-no-drag mx-1 text-xs text-slate-400">
        ⌘\
      </span>
      <button className="settings-btn app-region-no-drag ml-2 border-none bg-none">
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="9" cy="9" r="8" stroke="#cbd5e1" strokeWidth="2" />
          <circle cx="9" cy="9" r="2" fill="#cbd5e1" />
        </svg>
      </button>
    </div>
  );
};

export default CustomTitleBar;
