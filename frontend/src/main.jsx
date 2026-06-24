import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:   1000 * 60 * 5,   // 5 min
      retry:       1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background:  '#111827',
            color:       '#F1F5F9',
            border:      '1px solid #1E2A3A',
            borderRadius: '10px',
            fontSize:    '14px',
            boxShadow:   '0 8px 30px rgba(0,0,0,0.5)',
          },
          success: { iconTheme: { primary: '#10B981', secondary: '#111827' } },
          error:   { iconTheme: { primary: '#EF4444', secondary: '#111827' } },
        }}
      />
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </React.StrictMode>
);
