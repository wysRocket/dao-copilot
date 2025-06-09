import {createLazyFileRoute} from '@tanstack/react-router';
import ChatPage from '../../pages/assistant/ChatPage';

export const Route = createLazyFileRoute('/assistant/')({
  component: ChatPage,
});
