// Adapted from http://matthewfl.com/unPacker.html by matthew@matthewfl.com
export async function unpack(packed: string): Promise<string> {
	let context = `
		{
			eval: function (c) {
				packed = c;
			},
			window: {},
			document: {}
		}
	`;
	const toExecute = `
        function() {
            let packed = "";
            with(${context}) {
                ${packed}
            };
            return packed;
        }'
    `;

	const res: string = await runInPageContext(toExecute);
	return res
		.replace(/;/g, ';\n')
		.replace(/{/g, '\n{\n')
		.replace(/}/g, '\n}\n')
		.replace(/\n;\n/g, ';\n')
		.replace(/\n\\n/g, '\n');
}

// Adapted from: https://github.com/arikw/extension-page-context
async function runInPageContext<T>(toExecute: string): Promise<T> {
	// test that we are running with the allow-scripts permission
	try {
		window.sessionStorage;
	} catch (ignore) {
		return null;
	}

	// returned value container
	const resultMessageId = crypto.randomUUID();

	// prepare script container
	const scriptElm = document.createElement('script');
	scriptElm.setAttribute('type', 'application/javascript');

	const code = `
        (
            async function () {

                    const response = {
                        id: ${resultMessageId}
                    };

                    try {
                        response.result = JSON.stringify(await (${toExecute})() ); // run script
                    } catch(err) {
                        response.error = JSON.stringify(err);
                    }
            
                    window.postMessage(response, '*');
            }
        )();
    `;

	// inject the script
	scriptElm.textContent = code;

	// run the script
	document.documentElement.appendChild(scriptElm);

	// clean up script element
	scriptElm.remove();

	let resolve: (value: T) => void;
	let reject: (value: any) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	function onResult(event: MessageEvent) {
		if (event.data.id === resultMessageId) {
			window.removeEventListener('message', onResult);
			if (event.data.error !== undefined) {
				return reject(JSON.parse(event.data.error));
			}
			return resolve(event.data.result !== undefined ? JSON.parse(event.data.result) : undefined);
		}
	}

	window.addEventListener('message', onResult);

	return await promise;
}