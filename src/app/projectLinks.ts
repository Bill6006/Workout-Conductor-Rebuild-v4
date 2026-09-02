/** Public project links shown in the shell so progress can be followed from a phone. */

export const GITHUB_OWNER = 'Bill6006';
export const REPO_NAME = 'Workout-Conductor-Rebuild-v4';

export const REPO_URL = `https://github.com/${GITHUB_OWNER}/${REPO_NAME}`;
export const LIVE_URL = `https://${GITHUB_OWNER.toLowerCase()}.github.io/${REPO_NAME}/`;
export const STATUS_URL = `${REPO_URL}/blob/main/PROJECT_STATUS.md`;
export const ACTIONS_URL = `${REPO_URL}/actions`;
export const COMMITS_URL = `${REPO_URL}/commits/main`;

export function commitUrl(sha: string): string {
  return `${REPO_URL}/commit/${sha}`;
}
