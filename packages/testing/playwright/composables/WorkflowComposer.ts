import type { n8nPage } from '../pages/n8nPage';

/**
 * A class for user interactions with workflows that go across multiple pages.
 */
export class WorkflowComposer {
	constructor(private readonly n8n: n8nPage) {}

	/**
	 * Executes a successful workflow and waits for the notification to be closed.
	 * This waits for http calls and also closes the notification.
	 */
	async executeWorkflowAndWaitForNotification(notificationMessage: string) {
		const responsePromise = this.n8n.page.waitForResponse(
			(response) =>
				response.url().includes('/rest/workflows/') &&
				response.url().includes('/run') &&
				response.request().method() === 'POST',
		);

		await this.n8n.canvas.clickExecuteWorkflowButton();
		await responsePromise;
		await this.n8n.notifications.waitForNotificationAndClose(notificationMessage);
	}

	async createWorkflow(name?: string) {
		await this.n8n.workflows.clickAddWorklowButton();
		const workflowName = name ?? 'My New Workflow';
		await this.n8n.canvas.setWorkflowName(workflowName);
		await this.n8n.canvas.saveWorkflow();
	}
}
