import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import type { PageLoad } from './$types';

// The trip index has no content of its own – send it to the Overview dashboard.
export const load: PageLoad = ({ params }) => {
    throw redirect(307, `${base}/trip/${params.id}/overview`);
};
