import React from 'react';
import DragWindowRegion from '@/components/DragWindowRegion';

import CustomTitleBar from '@/components/CustomTitleBar';

export default function BaseLayout({children}: {children: React.ReactNode}) {
  return (
    <>
      <DragWindowRegion title="Drag to move the window" />
      <CustomTitleBar />
      <main className="h-screen p-2 pb-20">{children}</main>
    </>
  );
}
