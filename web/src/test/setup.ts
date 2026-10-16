/**
 * Test environment shims.
 *
 * jsdom parses `<dialog>` and reflects its `open` attribute, but does not
 * implement the modal API — so every component test that mounts something on
 * `Sheet` or `Dialog` would fail on `el.showModal is not a function` before it
 * could assert anything. This is the minimum needed to drive the elements the
 * components actually use; it is not a spec-complete implementation (no top
 * layer, no focus trap, no `::backdrop`).
 */

type Dialog = HTMLDialogElement & { open: boolean };

if (typeof HTMLDialogElement !== 'undefined') {
	const proto = HTMLDialogElement.prototype as Dialog;
	if (typeof proto.showModal !== 'function') {
		proto.showModal = function showModal(this: Dialog) {
			this.open = true;
		};
	}
	if (typeof proto.show !== 'function') {
		proto.show = function show(this: Dialog) {
			this.open = true;
		};
	}
	if (typeof proto.close !== 'function') {
		proto.close = function close(this: Dialog, returnValue?: string) {
			this.open = false;
			if (returnValue !== undefined) this.returnValue = returnValue;
			this.dispatchEvent(new Event('close'));
		};
	}
}
