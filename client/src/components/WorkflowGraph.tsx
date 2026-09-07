import { useMemo } from 'react';
import {
  ReactFlow, Background, Handle, Position, type Node, type Edge, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphResponse, GraphNode } from '../types';
import { StateBadge } from './Badges';

const STAGE_POSITIONS: Record<string, { x: number; y: number }> = {
  stage0_gate: { x: 0, y: 180 },
  input_intake: { x: 260, y: 40 },
  input_context: { x: 260, y: 320 },
  stage3_analysis: { x: 540, y: 180 },
  stage4_filter: { x: 820, y: 20 },
  stage4b_scoring: { x: 820, y: 180 },
  stage5_writeback: { x: 1100, y: 180 },
  stage6_review: { x: 1380, y: 180 },
  stage7_queue: { x: 1660, y: 180 },
  stage8_brief: { x: 1940, y: 180 },
  stage9_metrics: { x: 2220, y: 180 },
};

const EDGES: Array<[string, string, string?]> = [
  ['stage0_gate', 'input_intake'],
  ['stage0_gate', 'input_context'],
  ['input_intake', 'stage3_analysis'],
  ['input_context', 'stage3_analysis'],
  ['stage3_analysis', 'stage4_filter', 'not a signal'],
  ['stage3_analysis', 'stage4b_scoring', 'signal'],
  ['stage4b_scoring', 'stage5_writeback'],
  ['stage5_writeback', 'stage6_review'],
  ['stage6_review', 'stage7_queue'],
  ['stage7_queue', 'stage8_brief'],
  ['stage8_brief', 'stage9_metrics'],
];

type StageNodeData = GraphNode & { onOpen: (stage: string) => void };

function StageNode({ data }: NodeProps) {
  const d = data as unknown as StageNodeData;
  const pulse = d.state === 'running';
  return (
    <div
      onClick={() => d.onOpen(d.stage)}
      className="card px-4 py-3 cursor-pointer transition-shadow hover:shadow-md"
      style={{
        width: 220,
        borderColor: d.state === 'blocked' ? 'var(--critical)' : d.state === 'needs-human' ? 'var(--warning)' : 'var(--border)',
        borderWidth: d.state === 'blocked' || d.state === 'needs-human' ? 2 : 1,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--ink-muted)' }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--ink-muted)' }} />
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-sm font-semibold leading-tight">{d.label}</span>
        {pulse && <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />}
      </div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <StateBadge state={d.state} />
        <span className="text-lg font-bold tabular-nums" style={{ color: 'var(--ink-primary)' }}>{d.count}</span>
      </div>
      <div className="text-xs leading-snug" style={{ color: 'var(--ink-muted)' }}>{d.detail}</div>
    </div>
  );
}

const nodeTypes = { stage: StageNode };

export function WorkflowGraph({ graph, onOpenStage }: { graph: GraphResponse; onOpenStage: (stage: string) => void }) {
  const nodes: Node[] = useMemo(
    () =>
      graph.nodes.map((n) => ({
        id: n.stage,
        type: 'stage',
        position: STAGE_POSITIONS[n.stage] || { x: 0, y: 0 },
        data: { ...n, onOpen: onOpenStage },
      })),
    [graph, onOpenStage],
  );

  const edges: Edge[] = useMemo(
    () =>
      EDGES.map(([source, target, label]) => ({
        id: `${source}-${target}`,
        source,
        target,
        label,
        animated: false,
        style: { stroke: 'var(--gridline)', strokeWidth: 1.5 },
        labelStyle: { fill: 'var(--ink-muted)', fontSize: 11 },
        labelBgStyle: { fill: 'var(--surface-0)' },
      })),
    [],
  );

  return (
    <div style={{ height: 480, background: 'var(--surface-2)', borderRadius: 14, border: '1px solid var(--border)' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnScroll={false}
      >
        <Background color="var(--gridline)" gap={20} />
      </ReactFlow>
    </div>
  );
}
