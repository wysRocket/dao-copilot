import React from 'react';

import CustomTitleBar from '../components/CustomTitleBar';

export default function BaseLayout({children}: {children: React.ReactNode}) {
  return (
    <>
      <CustomTitleBar />
      <main className="h-screen p-2 pb-20">{children}</main>
    </>
  );
}
