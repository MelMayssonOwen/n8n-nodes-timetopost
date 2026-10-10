import type { INodeProperties } from 'n8n-workflow';
import { TimeToPost } from '../nodes/TimeToPost/TimeToPost.node';
import scheduleToDraft from '../examples/schedule-trigger-to-draft.json';

interface ExampleNode {
	type: string;
	typeVersion: number;
	credentials?: Record<string, unknown>;
	parameters: Record<string, unknown>;
}

describe('example workflows', () => {
	const desc = new TimeToPost().description;
	const names = new Set(desc.properties.map((p) => p.name));
	const examples: Record<string, { nodes: ExampleNode[] }> = {
		'schedule-trigger-to-draft.json': scheduleToDraft as unknown as { nodes: ExampleNode[] },
	};

	for (const [file, wf] of Object.entries(examples)) {
		it(`${file} references real node type, credential and parameters`, () => {
			for (const node of wf.nodes) {
				if (node.type !== 'n8n-nodes-timetopost.timeToPost') continue;
				expect(node.typeVersion).toBe(1);
				expect(Object.keys(node.credentials ?? {})).toEqual(['timeToPostApi']);
				const resource = desc.properties.find((p) => p.name === 'resource') as INodeProperties;
				const values = (resource.options as Array<{ value: string }>).map((o) => o.value);
				expect(values).toContain(node.parameters.resource);
				for (const key of Object.keys(node.parameters)) expect(names.has(key)).toBe(true);
			}
		});
	}
});
