function applyTemplateParams(workflow, cfg, params = {}) {
  if (!cfg.params) return workflow;
  for (const paramDef of cfg.params) {
    const value = params[paramDef.name];
    if (value !== undefined && paramDef.target_node && paramDef.target_field) {
      if (workflow[paramDef.target_node]) {
        workflow[paramDef.target_node].inputs[paramDef.target_field] = value;
      }
    }
  }
  return workflow;
}

function applyPromptInputs(workflow, cfg, params = {}) {
  if (!cfg.inputs) return workflow;
  for (const inputDef of cfg.inputs) {
    if (inputDef.type === 'prompt' && params[inputDef.name]) {
      if (inputDef.target_positive) {
        const { node, field } = inputDef.target_positive;
        if (workflow[node]) {
          workflow[node].inputs[field] = params[inputDef.name];
        }
      }
    }
  }
  return workflow;
}

function applyDefaultSeeds(workflow, cfg, params = {}) {
  if (!cfg.params) return workflow;
  for (const paramDef of cfg.params) {
    if (paramDef.type === 'seed' && params[paramDef.name] === undefined) {
      if (paramDef.target_node && paramDef.target_field && workflow[paramDef.target_node]) {
        workflow[paramDef.target_node].inputs[paramDef.target_field] = Math.floor(Math.random() * 2147483647);
      }
    }
  }
  return workflow;
}

function applyBatchGroups(workflow, cfg, uploadedImages = {}) {
  if (!cfg.inputs) return workflow;

  const batchGroups = {};
  for (const inputDef of cfg.inputs) {
    if (!inputDef.batch_group) continue;
    if (!uploadedImages[inputDef.name]) continue;
    if (!batchGroups[inputDef.batch_group]) {
      batchGroups[inputDef.batch_group] = {
        inputs: [],
        targetNode: inputDef.batch_target_node,
        targetField: inputDef.batch_target_field,
      };
    }
    batchGroups[inputDef.batch_group].inputs.push({
      loaderNode: inputDef.target_node,
      outputIndex: 0,
    });
  }

  for (const [groupName, group] of Object.entries(batchGroups)) {
    const connected = group.inputs.filter(i => workflow[i.loaderNode]);
    if (connected.length === 0) continue;

    if (connected.length === 1) {
      if (workflow[group.targetNode]) {
        workflow[group.targetNode].inputs[group.targetField] = [connected[0].loaderNode, connected[0].outputIndex];
      }
    } else {
      let batchCounter = 500;
      const firstBatchId = `batch_${groupName}_${batchCounter++}`;
      workflow[firstBatchId] = {
        class_type: 'ImageBatch',
        inputs: {
          image1: [connected[0].loaderNode, connected[0].outputIndex],
          image2: [connected[1].loaderNode, connected[1].outputIndex],
        },
      };
      let lastBatchRef = [firstBatchId, 0];

      for (let i = 2; i < connected.length; i++) {
        const nextId = `batch_${groupName}_${batchCounter++}`;
        workflow[nextId] = {
          class_type: 'ImageBatch',
          inputs: {
            image1: lastBatchRef,
            image2: [connected[i].loaderNode, connected[i].outputIndex],
          },
        };
        lastBatchRef = [nextId, 0];
      }

      if (workflow[group.targetNode]) {
        workflow[group.targetNode].inputs[group.targetField] = lastBatchRef;
      }
    }
  }

  return workflow;
}

module.exports = {
  applyTemplateParams,
  applyPromptInputs,
  applyDefaultSeeds,
  applyBatchGroups,
};
