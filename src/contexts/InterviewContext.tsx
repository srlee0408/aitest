'use client';

import React, { createContext, useState, useContext, ReactNode } from 'react';

interface InterviewContextType {
  threadId: string | null;
  setThreadId: (id: string) => void;
}

const InterviewContext = createContext<InterviewContextType | undefined>(undefined);

export const InterviewProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [threadId, setThreadId] = useState<string | null>(null);

  return (
    <InterviewContext.Provider value={{ threadId, setThreadId }}>
      {children}
    </InterviewContext.Provider>
  );
};

export const useInterview = () => {
  const context = useContext(InterviewContext);
  if (context === undefined) {
    throw new Error('useInterview must be used within an InterviewProvider');
  }
  return context;
};
