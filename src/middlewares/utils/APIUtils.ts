export const CMS_BRANCH_PREFIX = 'cms';
export const DEFAULT_STATIC_CMS_LABEL_PREFIX = 'static-cms/';
export const DEFAULT_PR_BODY = 'Automatically generated by Static CMS';
export const MERGE_COMMIT_MESSAGE = 'Automatically generated. Merged on Static CMS.';

export function generateContentKey(collectionName: string, slug: string) {
  return `${collectionName}/${slug}`;
}

export function parseContentKey(contentKey: string) {
  const index = contentKey.indexOf('/');
  return { collection: contentKey.slice(0, index), slug: contentKey.slice(index + 1) };
}

function getLabelPrefix(labelPrefix: string | undefined) {
  return labelPrefix ?? DEFAULT_STATIC_CMS_LABEL_PREFIX;
}

export function isCMSLabel(label: string, labelPrefix: string) {
  return label.startsWith(getLabelPrefix(labelPrefix));
}

export function labelToStatus(label: string, labelPrefix: string): string {
  return label.slice(getLabelPrefix(labelPrefix).length) ?? 'draft';
}

export function statusToLabel(status: string, labelPrefix: string) {
  return `${getLabelPrefix(labelPrefix)}${status}`;
}

export function contentKeyFromBranch(branch: string) {
  return branch.slice(`${CMS_BRANCH_PREFIX}/`.length);
}

export function branchFromContentKey(contentKey: string) {
  return `${CMS_BRANCH_PREFIX}/${contentKey}`;
}
