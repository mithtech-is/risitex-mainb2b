/**
 * Live product-category hierarchy, read straight from Medusa's native
 * Product Categories endpoint. This is the single source of truth for the
 * catalogue tree, breadcrumbs, and category filters — no hardcoded values.
 * Adding a category in the admin (Women, Kids, …) surfaces here with zero
 * code change.
 */
const BACKEND_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000";
const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

export type CategoryNode = {
  id: string;
  name: string;
  handle: string;
  rank: number;
  parentId: string | null;
  children: CategoryNode[];
};

type FlatCategory = {
  id: string;
  name: string;
  handle: string;
  rank?: number | null;
  parent_category_id?: string | null;
};

/** Fetch the full category tree (roots with nested children, rank-sorted). */
export async function getCategoryTree(): Promise<CategoryNode[]> {
  try {
    const url = `${BACKEND_URL}/store/product-categories?limit=500&fields=id,name,handle,rank,parent_category_id`;
    const res = await fetch(url, {
      headers: { "x-publishable-api-key": PUB_KEY },
      next: { revalidate: 30, tags: ["products"] },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { product_categories?: FlatCategory[] };
    const flat = (data.product_categories ?? []).map<CategoryNode>((c) => ({
      id: c.id,
      name: c.name,
      handle: c.handle,
      rank: c.rank ?? 0,
      parentId: c.parent_category_id ?? null,
      children: [],
    }));
    const byId = new Map(flat.map((c) => [c.id, c]));
    const roots: CategoryNode[] = [];
    for (const c of flat) {
      const parent = c.parentId ? byId.get(c.parentId) : undefined;
      if (parent) parent.children.push(c);
      else roots.push(c);
    }
    const sortRec = (nodes: CategoryNode[]) => {
      nodes.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
      nodes.forEach((n) => sortRec(n.children));
    };
    sortRec(roots);
    return roots;
  } catch {
    return [];
  }
}

/** A handle plus every descendant handle — used to match products under a node. */
export function descendantHandles(node: CategoryNode): string[] {
  const out = [node.handle];
  for (const c of node.children) out.push(...descendantHandles(c));
  return out;
}

/** Depth-first search for a node by its handle. */
export function findByHandle(
  nodes: CategoryNode[],
  handle: string,
): CategoryNode | null {
  for (const n of nodes) {
    if (n.handle === handle) return n;
    const found = findByHandle(n.children, handle);
    if (found) return found;
  }
  return null;
}

/**
 * Root→leaf path of {name, handle} for the given leaf handle. Powers the
 * product-page breadcrumb (e.g. Men → Bottom Wear → Jeans → Slim).
 */
export function pathToHandle(
  nodes: CategoryNode[],
  handle: string,
): { name: string; handle: string }[] {
  const trail: { name: string; handle: string }[] = [];
  const walk = (list: CategoryNode[]): boolean => {
    for (const n of list) {
      trail.push({ name: n.name, handle: n.handle });
      if (n.handle === handle) return true;
      if (walk(n.children)) return true;
      trail.pop();
    }
    return false;
  };
  walk(nodes);
  return trail;
}

/**
 * Given the handles a product is linked to, return the deepest (most
 * specific) category path so the breadcrumb shows the full chain even when
 * a product is tagged on multiple levels.
 */
export function deepestPath(
  nodes: CategoryNode[],
  productHandles: string[],
): { name: string; handle: string }[] {
  let best: { name: string; handle: string }[] = [];
  for (const h of productHandles) {
    const p = pathToHandle(nodes, h);
    if (p.length > best.length) best = p;
  }
  return best;
}
