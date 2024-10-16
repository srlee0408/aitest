import { InterviewProvider } from '../contexts/InterviewContext';

function MyApp({ Component, pageProps }: { Component: React.ComponentType<any>; pageProps: any }) {
  return (
    <InterviewProvider>
      <Component {...pageProps} />
    </InterviewProvider>
  );
}

export default MyApp;
