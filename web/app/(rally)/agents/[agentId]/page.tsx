import AgentProfile from "@/components/rally/AgentProfile";
import { AGENT_IDS } from "@/lib/rally/seed-ids";

export function generateStaticParams() {
  return AGENT_IDS.map((agentId) => ({ agentId }));
}

export default async function AgentPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return <AgentProfile agentId={agentId} />;
}
