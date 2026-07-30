import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueueModeBanner } from '@/components/QueueModeBanner';
import CredentialsPage from '@/pages/credentials';
import NotFound from '@/pages/not-found';
import WorkflowEditorPage from '@/pages/workflow-editor';
import WorkflowsListPage from '@/pages/workflows-list';
import { Route, Switch, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={WorkflowsListPage} />
      <Route path="/credentials" component={CredentialsPage} />
      <Route path="/workflows/:id" component={WorkflowEditorPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <QueueModeBanner />
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
