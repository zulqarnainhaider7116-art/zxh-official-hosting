import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import DeploymentLive from '../../components/DeploymentLive';

export default function DeploymentView() {
  const { id = '' } = useParams();
  return (
    <div>
      <Link to="/app/deployments" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" />All deployments</Link>
      <DeploymentLive key={id} id={id} />
    </div>
  );
}
