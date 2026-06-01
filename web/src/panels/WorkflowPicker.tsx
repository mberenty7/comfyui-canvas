import { useEffect, useState } from 'react';
import type { TemplateParam } from '../types';

interface TemplateSummary {
  id: string;
  name: string;
  description?: string;
  color?: string;
  cost?: { credits: number; note?: string } | null;
}

interface TemplateFull extends TemplateSummary {
  inputs?: unknown[];
  params?: TemplateParam[];
  workflow?: Record<string, unknown>;
  backend?: string;
  bfl_endpoint?: string;
}

/** Builds the `data` bag for a new workflow node from a fetched template. */
export function workflowDataFromTemplate(t: TemplateFull) {
  const params = (t.params ?? []) as TemplateParam[];
  const paramValues: Record<string, unknown> = {};
  for (const p of params) paramValues[p.name] = p.default ?? '';
  return {
    label: '',
    templateId: t.id,
    templateName: t.name,
    templateColor: t.color ?? '#4a9eff',
    cost: t.cost ?? null,
    inputs: t.inputs ?? [],
    params,
    workflow: t.workflow ?? {},
    paramValues,
    connectedInputs: {},
    backend: t.backend ?? 'comfy',
    bflEndpoint: t.bfl_endpoint ?? '',
  };
}

export function WorkflowPicker({
  onPick,
  onCancel,
}: {
  onPick: (data: ReturnType<typeof workflowDataFromTemplate>) => void;
  onCancel: () => void;
}) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/templates')
      .then((r) => r.json())
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message));
  }, []);

  async function choose(id: string) {
    const t = (await (await fetch(`/api/templates/${id}`)).json()) as TemplateFull;
    onPick(workflowDataFromTemplate(t));
  }

  return (
    <div className="cv-modal-overlay" onClick={onCancel}>
      <div className="cv-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Choose Workflow</h3>
        {error && <div className="cv-modal-error">Failed to load templates: {error}</div>}
        {!error && templates.length === 0 && <div className="cv-modal-note">Loading templates…</div>}
        <div className="cv-template-list">
          {templates.map((t) => (
            <div key={t.id} className="cv-template-card" onClick={() => choose(t.id)}>
              <h4 style={{ color: t.color || '#4a9eff' }}>{t.name}</h4>
              <p>{t.description || ''}</p>
            </div>
          ))}
        </div>
        <button className="prop-btn" style={{ width: '100%', marginTop: 12 }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
