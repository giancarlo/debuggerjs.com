
// TODO ?
this.cxl = {

	extendClass(Parent, p)
	{
		class Result extends Parent { }
		cxl.extend(Result.prototype, p);
		return Result;
	},

	extend(A, B, C, D)
	{
		for (var i in B)
			if (B.hasOwnProperty(i))
				Object.defineProperty(A, i, Object.getOwnPropertyDescriptor(B, i));
		if (C || D)
			cxl.extend(A, C, D);

		return A;
	}

};

(rx => {
	'use strict';

	class Subscriber {
		constructor(observer, error, complete, unsubscribe) {
			if (observer && typeof observer !== 'function') {
				error = observer.error;
				complete = observer.complete;
				observer = observer.next;
			}

			this.isUnsubscribed = false;
			this.__next = observer;
			this.__error = error;
			this.__complete = complete;
			this.__unsubscribe = unsubscribe;
		}

		next(val) {
			try {
				if (!this.isUnsubscribed && this.__next)
					this.__next.call(this, val);
			} catch (e) {
				this.error(e);
			}
		}

		error(e) {
			if (!this.isUnsubscribed && this.__error)
				this.__error.call(this, e);
			this.unsubscribe();
		}

		complete() {
			if (!this.isUnsubscribed && this.__complete) this.__complete();
			this.unsubscribe();
		}

		unsubscribe() {
			this.isUnsubscribed = true;
			if (this.__unsubscribe) this.__unsubscribe();
		}
	}

	class Observable {
		static create(A, B, C) {
			return new this(A, B, C);
		}

		constructor(subscribe) {
			if (subscribe) this.__subscribe = subscribe;
		}

		pipe(operator) {
			return operator(this);
		}

		subscribe(observer, error, complete) {
			const subscriber = new Subscriber(observer, error, complete);

			subscriber.__unsubscribe = this.__subscribe(subscriber);

			return subscriber;
		}
	}

	class Subject extends Observable {
		constructor() {
			super(subscriber => {
				subscribers.add(subscriber);

				if (this.onSubscribe) this.onSubscribe(subscriber);

				return subscribers.delete.bind(subscribers, subscriber);
			});

			const subscribers = (this.observers = new Set());
		}

		next(a) {
			this.observers.forEach(s => s.next(a));
		}
		error(e) {
			this.observers.forEach(s => s.error(e));
		}
		complete() {
			this.observers.forEach(s => s.complete());
		}
	}

	class BehaviorSubject extends Subject {
		constructor(val) {
			super();
			this.value = val;
		}

		onSubscribe(subscriber) {
			if (this.value !== undefined) subscriber.next(this.value);
		}

		next(val) {
			this.value = val;
			super.next(val);
		}
	}

	class Event {
		constructor(type, target, value) {
			this.type = type;
			this.target = target;
			this.value = value;
		}
	}

	class Item {
		constructor(value, key, next) {
			this.value = value;
			this.key = key;
			this.next = next;
		}
	}

	class CollectionEvent {
		constructor(target, type, value, nextValue) {
			this.target = target;
			this.type = type;
			this.value = value;
			this.nextValue = nextValue;
		}
	}

	function map(operator) {
		return source =>
			new Observable(subscriber => {
				const subscription = source.subscribe(
					val => subscriber.next(operator(val)),
					subscriber.error.bind(subscriber),
					subscriber.complete.bind(subscriber)
				);
				return subscription.unsubscribe.bind(subscription);
			});
	}

	function operator(fn) {
		return source =>
			new Observable(subscriber => {
				const subscription = source.subscribe(fn(subscriber));
				return subscription.unsubscribe.bind(subscription);
			});
	}

	class EventEmitter {
		on(type, callback, scope) {
			return this.addEventListener(type, callback, scope);
		}

		off(type, callback, scope) {
			return this.removeEventListener(type, callback, scope);
		}

		addEventListener(type, callback, scope) {
			if (!this.__handlers) this.__handlers = {};
			if (!this.__handlers[type]) this.__handlers[type] = [];

			this.__handlers[type].push({ fn: callback, scope: scope });
			return { unsubscribe: this.off.bind(this, type, callback, scope) };
		}

		removeEventListener(type, callback, scope) {
			const handlers = this.__handlers && this.__handlers[type],
				h =
					handlers &&
					handlers.find(h => h.fn === callback && h.scope === scope),
				i = handlers.indexOf(h);
			if (i === -1) throw new Error('Invalid listener');

			handlers.splice(i, 1);
		}

		$eachHandler(type, fn) {
			if (this.__handlers && this.__handlers[type])
				this.__handlers[type].forEach(handler => {
					try {
						fn(handler);
					} catch (e) {
						if (type !== 'error') this.trigger('error', e);
						else throw e;
					}
				});
		}

		emit(type, a, b, c) {
			this.$eachHandler(type, handler =>
				handler.fn.call(handler.scope, a, b, c)
			);
		}

		emitAndCollect(type, a, b, c) {
			const result = [];

			this.$eachHandler(type, handler =>
				result.push(handler.fn.call(handler.scope, a, b, c))
			);

			return result;
		}

		trigger(type, a, b, c) {
			return this.emit(type, a, b, c);
		}

		once(type, callback, scope) {
			const subscriber = this.on(type, (a, b, c) => {
				subscriber.unsubscribe();
				return callback.call(scope, a, b, c);
			});
		}
	}

	Object.assign(rx, {
		BehaviorSubject: BehaviorSubject,
		CollectionEvent: CollectionEvent,
		Event: Event,
		EventEmitter: EventEmitter,
		Item: Item,
		Observable: Observable,
		Subject: Subject,
		Subscriber: Subscriber,

		toPromise(observable) {
			return new Promise((resolve, reject) => {
				observable.subscribe(
					function(val) {
						this.unsubscribe();
						resolve(val);
					},
					e => setTimeout(reject.bind(this, e))
				);
			});
		},

		operators: {
			map: map,
			filter(fn) {
				return operator(subscriber => val =>
					fn(val) && subscriber.next(val)
				);
			}
		},

		map: map,
		filter(fn) {
			return operator(subscriber => val =>
				fn(val) && subscriber.next(val)
			);
		}
	});
})(
	this.cxl
		? (this.cxl.rx = {})
		: global.cxl
		? (global.cxl.rx = module.exports)
		: module.exports
);

(cxl => {
	'use strict';

	const EMPTY_NODE_REGEX = /\S/;

	function $$find(child, selector, first, next) {
		let result;

		while (child) {
			if (selector(child)) return child;

			if (child[first]) {
				if ((result = $$find(child[first], selector))) return result;
			}

			child = child[next];
		}

		return null;
	}

	function $$findSelector(selector) {
		if (typeof selector === 'string')
			return item => item.matches && item.matches(selector);

		return selector;
	}

	function dom(tagName, attr) {
		const el = dom.createElement(tagName);

		for (const i in attr) el[i] = attr[i];

		return el;
	}

	cxl.dom = Object.assign(dom, {
		createElement(tagName) {
			return document.createElement(tagName);
		},

		empty(el) {
			let c;
			while ((c = el.childNodes[0])) el.removeChild(c);
		},

		event: {
			stop(ev) {
				ev.stopPropagation();
				ev.stopImmediatePropagation();
			},
			halt(ev) {
				ev.preventDefault();
				dom.event.stop();
			}
		},

		find(el, selector) {
			return $$find(
				el.firstChild,
				$$findSelector(selector),
				'firstChild',
				'nextSibling'
			);
		},

		findNext(child, selector) {
			return $$find(
				child.nextSibling,
				$$findSelector(selector),
				'firstChild',
				'nextSibling'
			);
		},

		findPrevious(child, selector) {
			return $$find(
				child.previousSibling,
				$$findSelector(selector),
				'lastChild',
				'previousSibling'
			);
		},

		/**
		 * Remove empty nodes
		 * TODO Improve performance, or move it to build time.
		 */
		normalize(node) {
			let child = node.firstChild;

			while (child) {
				const nodeType = child.nodeType;

				if (nodeType === Node.COMMENT_NODE) node.removeChild(child);
				else if (
					nodeType === Node.TEXT_NODE &&
					!EMPTY_NODE_REGEX.test(child.nodeValue)
				)
					node.removeChild(child);
				else if (
					nodeType === Node.ELEMENT_NODE &&
					child.childNodes.length
				)
					dom.normalize(child);

				child = child.nextSibling;
			}

			return node;
		},

		query(el, selector, result) {
			var child = el.firstChild;
			result = result || [];

			while (child) {
				if (child.matches && child.matches(selector))
					result.push(child);

				if (child.firstChild) dom.query(child, selector, result);

				child = child.nextSibling;
			}

			return result;
		},

		setContent(el, content) {
			dom.empty(el);
			dom.insert(el, content);
		},

		on(element, event, handler, options) {
			element.addEventListener(event, handler, options);
			return element.removeEventListener.bind(
				element,
				event,
				handler,
				options
			);
		},

		setAttribute(el, attr, val) {
			if (val === false || val === null || val === undefined) val = null;
			else if (val === true) val = '';
			else val = val.toString();

			if (val === null) el.removeAttribute(attr);
			else el.setAttribute(attr, val);

			return val;
		},

		insert(el, content) {
			if (content === undefined || content === null) return;

			if (!(content instanceof window.Node))
				content = document.createTextNode(content);

			el.appendChild(content);
		},

		isEmpty(el) {
			return el.childNodes.length === 0;
		},

		removeChild(el, child) {
			el.removeChild(child);
		},

		remove(child) {
			if (Array.isArray(child))
				return child.forEach(c => dom.removeChild(child.parentNode, c));

			if (child.parentNode) dom.removeChild(child.parentNode, child);
		},

		setStyle(el, className, enable) {
			el.classList[enable || enable === undefined ? 'add' : 'remove'](
				className
			);
		},

		trigger(el, event, detail) {
			var ev = new window.Event(event, { bubbles: true });
			ev.detail = detail;
			el.dispatchEvent(ev);
		}
	});
})(this.cxl);

(cxl => {
	'use strict';

	const ANCHORS = {},
		MAX_DIGEST = 9,
		PARAM_REGEX = /\:([\w_\$]+)/g,
		Undefined = {},
		Skip = {},
		GETTERS = {},
		SETTERS = {},
		rx = cxl.rx,
		dom = cxl.dom,
		bindRegex = /\s*([:|])?([^\w])?([^\(:\s>"'=\|]+)(?:\(([^\)]+)\))?(:|\|)?/g;

	class Renderer {
		constructor() {
			this.pipeline = [];
			this.raf = null;
			this.commit = this.$commit.bind(this);
		}

		$doDigest(b, view) {
			let newVal = b.digest(view.state);

			if (b.value !== newVal) {
				b.set(newVal);
				return true;
			}
		}

		digestBinding(b, view) {
			try {
				return this.$doDigest(b, view);
			} catch (e) {
				// Ignore Errors on Prod mode
			}
		}

		commitDigest(view) {
			var i,
				b = view.bindings,
				changed = true,
				count = 0,
				binding;

			while (changed) {
				changed = false;

				for (i = 0; i < b.length; ++i) {
					binding = b[i];

					if (binding.digest && this.digestBinding(binding, view))
						changed = true;
				}

				if (count++ > MAX_DIGEST)
					throw new Error('Max digest cycle iterations reached.');
			}

			view.$dirty = false;
		}

		$commit() {
			const pipeline = this.pipeline;

			for (let i = 0; i < pipeline.length; ++i)
				this.commitDigest(pipeline[i]);

			pipeline.length = 0;

			this.raf = null;
		}

		request() {
			if (this.raf === null)
				this.raf = requestAnimationFrame(this.commit);
		}

		digest(view) {
			if (!view.$dirty) {
				view.$dirty = true;
				this.pipeline.push(view);
				this.request();
			}
		}

		cancel() {
			cancelAnimationFrame(this.raf);
		}
	}

	const renderer = new Renderer();

	class Directive {
		constructor(element, parameter, owner) {
			this.element = element;
			this.parameter = parameter;
			this.owner = owner;

			if (this.initialize) this.initialize(element, parameter, owner);

			if (this.connect && this.owner.isConnected)
				this.connect(this.owner.state);
		}

		subscribe(subscriber) {
			this.subscriber = subscriber;
			return this;
		}

		doConnect() {
			if (this.connect) this.connect(this.owner.state);

			this.connected = true;

			if (this.subscriber && this.subscriber.doConnect)
				this.subscriber.doConnect();
		}

		destroy() {
			if (this.disconnect) this.disconnect();

			if (this.subscriber && this.subscriber.destroy)
				this.subscriber.destroy();

			// SUpport for both Destroyable and Observable objects.
			if (this.bindings)
				this.bindings.forEach(b =>
					b.destroy ? b.destroy() : b.unsubscribe()
				);

			this.bindings = null;

			this.connected = false;
		}

		error(e) {
			if (this.subscriber) this.subscriber.error(e);

			this.destroy();
		}

		set(newVal) {
			this.value = newVal;

			if (this.connected === false) return;

			if (this.owner) this.owner.digest();

			if (this.subscriber) this.subscriber.next(this.value);

			if (this.once) this.destroy();
		}

		next(val) {
			var newVal;

			if (this.update)
				newVal = this.update(val, this.owner && this.owner.state);

			if (newVal === Skip) return;

			if (newVal instanceof Promise)
				newVal.then(this.set.bind(this), this.error.bind(this));
			else this.set(newVal === undefined ? val : newVal);
		}

		clone() {
			var result = new this.constructor(
				this.element,
				this.parameter,
				this.owner
			);

			result.once = this.once;

			return result;
		}
	}

	Object.assign(Directive.prototype, {
		value: Undefined,
		once: false
	});

	class EventListener {
		constructor(element, event, handler, options) {
			this.destroy = dom.on(element, event, handler, options);
		}
	}

	class Store {
		constructor(State) {
			this.bindings = [];
			this.state =
				typeof State === 'function' ? new State() : State || {};
		}

		set(property, value) {
			if (value !== this.state[property]) {
				this.state[property] = value;
				renderer.digest(this);
			}
		}

		observe(path) {
			const directive = new cxl.compiler.directives.state(
				this.host,
				path,
				this
			);
			this.bindings.push(directive);
			return directive;
		}

		digest() {
			renderer.digest(this);
		}

		destroy() {
			this.bindings.forEach(b => b.destroy());
		}
	}

	class View extends Store {
		constructor(State, host) {
			super(State);
			this.host = host;

			this.connected = new rx.Subject();
		}

		setAttribute(name, newVal) {
			this.set(name, newVal === '' ? true : newVal || false);
		}

		registerSlot(slot) {
			if (!slot.parameter) this.defaultSlot = slot;

			if (!this.slots) this.slots = [];

			this.slots.push(slot);
		}

		connect() {
			// Set as connected so bindings added by template directives
			// Auto connect
			this.isConnected = true;

			if (this.bindings.length) {
				this.bindings.forEach(b => b.doConnect());
				cxl.renderer.commitDigest(this);
			}

			this.connected.next(true);
		}

		disconnect() {
			if (this.bindings.length) renderer.commitDigest(this);
			this.isConnected = false;
			this.connected.next(false);
			this.destroy();
		}
	}

	/**
	 * Creates References and Bindings.
	 */
	class Compiler {
		constructor() {
			this.directives = {};
			this.shortcuts = {
				'=': 'state',
				'#': 'call',
				$: 'item',
				'@': 'getset'
			};
		}

		directiveNotFound(directive) {
			throw new Error('Directive "' + directive + '" not found.');
		}

		getDirective(parsed, element, owner) {
			var shortcut = parsed[2],
				name = parsed[3],
				param = parsed[4],
				directive = shortcut && this.shortcuts[shortcut],
				Ref,
				result;
			if (directive) param = name;
			else directive = name;

			Ref = this.directives[directive];

			if (!Ref) this.directiveNotFound(directive, element, owner);

			result = new Ref(element, param, owner);

			return result;
		}

		createBinding(refA, refB, modifier, owner) {
			var twoway = modifier === ':',
				once = modifier === '|',
				clone;
			if (once) refA.once = true;

			if (refA) {
				refA.subscribe(refB);

				if (twoway) {
					clone = refA.clone();
					refB.subscribe(clone);

					owner.bindings.push(refB);
				}
			} else if (refB) owner.bindings.push(refB);
		}

		parseBinding(element, bindingText, owner) {
			var parsed, refA, refB, index;

			bindRegex.lastIndex = 0;

			while ((parsed = bindRegex.exec(bindingText))) {
				index = bindRegex.lastIndex;
				refB = this.getDirective(parsed, element, owner);
				this.createBinding(refA, refB, parsed[1], owner);

				refA = parsed[5] && refB;

				bindRegex.lastIndex = index;
			}
		}

		compile(node, owner) {
			var binding = node.getAttribute && node.getAttribute('&');

			if (binding) this.parseBinding(node, binding, owner);

			if (node.firstChild) this.traverse(node.firstChild, owner);
		}

		traverse(node, owner) {
			const next = node.nextSibling;

			this.compile(node, owner);

			if (next) this.traverse(next, owner);
		}
	}

	const compiler = new Compiler();

	class Template {
		static fromId(id) {
			return new Template(document.getElementById(id).innerHTML);
		}

		static getFragmentFromString(content) {
			// We use <template> so components are not initialized
			const template = document.createElement('TEMPLATE');
			template.innerHTML = content.trim();
			return template.content;
		}

		static getFragment(content) {
			if (typeof content === 'string')
				return Template.getFragmentFromString(content);

			if (content instanceof window.Element) {
				if (content.tagName === 'TEMPLATE' && content.content)
					return content.content;

				content = content.childNodes;
			}

			var result = document.createDocumentFragment();

			while (content.length) result.appendChild(content[0]);

			return result;
		}

		constructor(content) {
			this.$content = dom.normalize(Template.getFragment(content));
		}

		clone() {
			return document.importNode(this.$content, true);
		}

		compile(owner) {
			const nodes = this.clone();

			if (nodes.childNodes.length)
				compiler.traverse(nodes.firstChild, owner);

			return nodes;
		}
	}

	class NodeSnapshot {
		constructor(nodes) {
			this.nodes = [];

			for (var n of nodes) this.nodes.push(n);
		}

		appendTo(el) {
			this.nodes.forEach(n => el.appendChild(n));
		}

		remove() {
			this.nodes.forEach(
				n => n.parentNode && n.parentNode.removeChild(n)
			);
		}
	}

	class MutationEvent extends rx.Event {}

	class AttributeObserver extends rx.Subject {
		$onMutation(events) {
			events.forEach(ev => this.trigger(ev.attributeName));
		}

		$onEvent() {
			if (this.element.value !== this.$value) {
				this.$value = this.element.value;
				this.trigger('value');
			}

			if (this.element.checked !== this.$checked) {
				this.$checked = this.element.checked;
				this.trigger('checked');
			}
		}

		$initializeNative(element) {
			this.observer = new MutationObserver(this.$onMutation.bind(this));
			this.observer.observe(element, { attributes: true });

			this.bindings = [
				new EventListener(element, 'change', this.$onEvent.bind(this))
			];
		}

		constructor(element) {
			if (element.$$attributeObserver) return element.$$attributeObserver;

			super();

			this.element = element;
			element.$$attributeObserver = this;
		}

		onSubscribe() {
			// Use mutation observer for native dom elements
			if (!this.element.$view && !this.observer)
				this.$initializeNative(this.element);
		}

		unsubscribe(s) {
			super.unsubscribe(s);

			if (this.__subscribers.length === 0) this.disconnect();
		}

		disconnect() {
			if (this.observer) {
				this.observer.disconnect();
				this.bindings.forEach(b => b.destroy());
			}
		}

		trigger(attributeName) {
			this.next(
				new MutationEvent('attribute', this.element, attributeName)
			);
		}

		destroy() {
			super.destroy();
			this.disconnect();
		}
	}

	class Marker {
		constructor(element, text) {
			const parent = element.parentNode;

			this.node = document.createComment(text || '');
			this.children = [];
			this.element = element;
			parent.insertBefore(this.node, element);
			dom.remove(element);
			// TODO. Used by marker.empty directive
			element.$marker = this;
		}

		toggle(val, removeTo) {
			const el = this.element;

			if (val) this.node.parentNode.insertBefore(el, this.node);
			else {
				if (removeTo) removeTo.appendChild(el);
				else cxl.dom.remove(el);
			}
		}

		insert(content, nextNode) {
			// TODO performance.
			this.children.push(new NodeSnapshot(content.childNodes));
			this.node.parentNode.insertBefore(content, nextNode || this.node);
		}

		empty() {
			this.children.forEach(snap => snap.remove());
			this.children = [];
		}
	}

	class ChildrenObserver extends rx.Subject {
		$event(type, el) {
			return new MutationEvent(type, this.element, el);
		}

		$trigger(type, nodes) {
			for (let el of nodes) this.next(this.$event(type, el));
		}

		$handleEvent(ev) {
			this.$trigger('added', ev.addedNodes);
			this.$trigger('removed', ev.removedNodes);
		}

		$onEvents(events) {
			events.forEach(this.$handleEvent, this);
		}

		constructor(element) {
			if (element.$$childrenObserver) return element.$$childrenObserver;

			super();
			this.element = element;
			element.$$childrenObserver = this;
		}

		onSubscribe() {
			if (!this.observer) {
				this.observer = new MutationObserver(this.$onEvents.bind(this));
				this.observer.observe(this.element, { childList: true });
			}
		}

		unsubscribe(s) {
			super.unsubscribe(s);

			if (this.__subscribers.length === 0) this.observer.disconnect();
		}

		destroy() {
			super.destroy();
			this.observer.disconnect();
		}
	}

	function directive(name, Fn, shortcut) {
		if (typeof Fn !== 'function') Fn = cxl.extendClass(Directive, Fn, name);

		if (shortcut) compiler.shortcuts[shortcut] = name;

		return (compiler.directives[name] = Fn);
	}

	directive('value', {
		initialize() {
			// Prevent value from digesting
			this.value = this.element.value;
		},

		connect() {
			var owner = this.owner;

			function onChange() {
				renderer.digest(owner);
			}

			this.bindings = [
				new EventListener(this.element, 'change', onChange),
				new EventListener(this.element, 'input', onChange)
			];
		},

		update(val) {
			if (this.element.value !== val) this.element.value = val;
		},

		digest() {
			return this.element.value;
		}
	});

	directive('owner', {
		digest() {
			return this.owner;
		}
	});

	directive('ref.get', {
		initialize() {
			this.bindings = [
				this.owner.observe(this.parameter).subscribe(this)
			];
		},

		update(ref) {
			if (this.subscription) this.subscription.unsubscribe();

			if (ref)
				this.bindings[1] = this.subscription = ref.subscribe(
					this.set.bind(this)
				);

			return Skip;
		}
	});

	directive('ref.set', {
		initialize() {
			this.getter = cxl.getter(this.parameter);
		},

		update(val, state) {
			const ref = this.getter(state);
			// TODO reference should always be set?
			if (ref && this.value !== val) ref.set(val);
		}
	});

	directive(
		'ref.val',
		{
			initialize() {
				this.getter = cxl.getter(this.parameter);
				this.bindings = [
					this.owner.observe(this.parameter).subscribe({
						next: this.setup.bind(this),
						destroy: this.destroySubscription.bind(this)
					})
				];
			},

			destroySubscription() {
				this.subscription.unsubscribe();
			},

			setup(ref) {
				if (this.subscription) this.destroySubscription();

				this.reference = ref;

				if (ref)
					this.bindings[1] = this.subscription = ref.subscribe(
						this.onValue.bind(this)
					);
			},

			onValue(val) {
				this.set(val);
			},

			update(val, state) {
				const ref = this.getter(state);
				// TODO reference should always be set?
				if (ref && this.value !== val) ref.set(val);
			}
		},
		'&'
	);

	directive('get', {
		update(val, state) {
			return this.digest(state);
		},

		digest(state) {
			this.digest = cxl.getter(this.parameter);
			return this.digest(state);
		}
	});

	directive('state', {
		update(val, state) {
			this.update = cxl.setter(this.parameter);
			return this.update(val, state);
		},

		digest(state) {
			if (this.parameter) {
				this.digest = cxl.getter(this.parameter);
				return this.digest(state);
			}

			return state;
		}
	});

	directive(
		'style',
		{
			update(val) {
				if (!this.parameter) {
					if (this.oldValue !== val)
						dom.setStyle(
							this.element,
							this.oldValue,
							false,
							this.prefix
						);
					this.oldValue = val;
				}

				dom.setStyle(
					this.element,
					this.parameter || val,
					val || false,
					this.prefix
				);
			},
			digest() {
				this.update(true);
				this.digest = null;
			}
		},
		'.'
	);

	directive('getset', {
		update(val) {
			this.element[this.parameter || val] = val;
		},

		$digest() {
			return this.element[this.parameter];
		},

		onMutation(ev) {
			if (ev.type === 'attribute' && ev.value === this.parameter)
				this.owner.digest();
		},

		digest() {
			var observer = (this.observer = new AttributeObserver(
				this.element
			));

			this.bindings = [observer.subscribe(this.onMutation.bind(this))];

			this.digest = this.$digest;

			return this.element[this.parameter];
		}
	});

	directive('item', {
		initialize() {
			this.item = this.owner.state.$item;
		},

		update(val) {
			if (this.parameter) this.item[this.parameter] = val;
			else this.owner.state.$item = val;
		},

		digest() {
			return this.parameter ? this.item[this.parameter] : this.item;
		}
	});

	directive('item.each', {
		each(value, key) {
			const item = new rx.Item(value, key);
			item.index = this.index++;
			this.subscriber.next(item);
		},

		set(val) {
			this.value = val;
			this.index = 0;

			if (this.subscriber) cxl.each(val, this.each, this);

			if (this.once) this.destroy();
		}
	});

	directive('each', {
		each(item) {
			this.subscriber.next(item);
		},

		set(val) {
			this.value = val;

			if (this.subscriber) cxl.each(val, this.each, this);

			if (this.once) this.destroy();
		}
	});

	// TODO
	directive('each.list', {
		value: null,

		notify(subscriber, oldList, list) {
			if (!list) return subscriber.next({ type: 'empty' });
			const keys = Object.keys(list);

			// TODO performance
			cxl.each(oldList, (value, key) => {
				const index = keys.indexOf(key.toString()),
					event =
						index !== -1
							? {
									type: 'changed',
									value: list[key],
									oldValue: value,
									nextValue: list[keys[index + 1]]
							  }
							: { type: 'removed', value: value };
				subscriber.next(event);
			});

			cxl.each(list, (value, key) => {
				const index = keys.indexOf(key.toString());

				if (!oldList || !(key in oldList))
					subscriber.next({
						type: 'added',
						value: value,
						nextValue: list[keys[index + 1]]
					});
			});
		},

		update(list) {
			const oldList = this.value,
				subscriber = this.subscriber;
			this.value = list;

			if (subscriber) this.notify(subscriber, oldList, list);

			return Skip;
		}
	});

	class ElementChildren {
		constructor(element) {
			if (element.$elementChildren) return element.$elementChildren;

			this.el = element;
		}

		get first() {
			return this.el.firstElementChild;
		}
		get last() {
			return this.el.lastElementChild;
		}
		get focused() {
			return this.el.querySelector(':focus');
		}

		nextTo(el) {
			return el && el.nextElementSibling;
		}
		previousTo(el) {
			return el && el.previousElementSibling;
		}
	}

	class ElementList {
		constructor(element, owner) {
			this.items = new Map();
			this.template = new Template(element);
			this.marker = new Marker(element, 'list');
			this.owner = owner;
		}

		add(item, next) {
			this.owner.state.$item = item;
			const nextNode = next && this.items.get(next),
				fragment = this.template.compile(this.owner);
			this.items.set(item, new NodeSnapshot(fragment.childNodes));
			// cxl.renderer.commitDigest(this.owner);
			this.marker.insert(fragment, nextNode && nextNode.nodes[0]);
		}

		change(item, oldItem) {
			// TODO Find a better way
			// TODO Implement reordering
			this.owner.bindings.forEach(b => {
				if (b.item === oldItem) b.item = item;
			});

			if (item !== oldItem) {
				if (!this.items.has(oldItem)) throw new Error('Invalid item');

				this.items.set(item, this.items.get(oldItem));
				this.items.delete(oldItem);
			}
		}

		remove(item) {
			this.items.get(item).remove();
			this.items.delete(item);
		}

		empty() {
			if (this.items.size) {
				this.items.forEach(item => item.remove());
				this.items.clear();
			}
		}

		destroy() {
			this.items.clear();
		}
	}

	directive('list', {
		initialize() {
			this.bindings = [
				(this.list = new ElementList(this.element, this.owner))
			];
		},

		update(event) {
			if (event.type === 'added')
				this.list.add(event.value, event.nextValue);
			else if (event.type === 'removed') this.list.remove(event.value);
			else if (event.type === 'changed')
				this.list.change(event.value, event.oldValue, event.nextValue);
			else if (event.type === 'empty') this.list.empty();
		}
	});

	directive('list.sort', {
		initialize() {
			this.order = [];
			this.getter = this.parameter && cxl.getter(this.parameter);
		},
		findNext(val) {
			const i = this.order.findIndex(c => c > val);
			this.order.splice(i, 0, val, i);
		},
		update(event) {
			if (event.type === 'added') {
				const val = this.getter
					? this.getter(event.value)
					: event.value;
				event.next = this.findNext(val);
			}
		}
	});

	directive('list.count', {
		value: 0,
		update(event) {
			if (event.type === 'added') this.value++;
			else if (event.type === 'removed') this.value--;
			else if (event.type === 'empty') this.value = 0;

			return this.value;
		}
	});

	directive('id', {
		initialize() {
			if (this.parameter) this.update(this.parameter, this.owner.state);
		},

		update(val, state) {
			state[val] = this.element;
		}
	});

	directive('content', {
		initialize() {
			const component = this.owner.host,
				slot = (this.slot = this.createSlot());
			if (this.parameter) {
				this.observer = new ChildrenObserver(component);
				slot.name = this.parameter;
			}

			this.owner.registerSlot(this);

			if (this.element !== slot) this.element.appendChild(slot);
		},

		createSlot() {
			return this.element.tagName === 'SLOT'
				? this.element
				: document.createElement('SLOT');
		},

		connect() {
			if (this.parameter) {
				this.bindings = [
					this.observer.subscribe(this.onMutation.bind(this))
				];

				// Initialize children slots
				for (var node of this.owner.host.childNodes)
					this.assignSlot(node);
			}
		},

		assignSlot(node) {
			var sel = this.parameter;

			if (node.matches && node.matches(sel)) {
				node.slot = sel;
				// Fire directive only if subscriber found
				if (this.subscriber) this.set(node);
			}
		},

		onMutation(ev) {
			if (ev.type === 'added') this.assignSlot(ev.value);
		}
	});

	directive('action', {
		onEvent(ev) {
			this.set(ev);
		},

		onKeyPress(ev) {
			// Prevent double firing for links, Enter key generates a click event.
			if (
				(this.element.tagName !== 'A' && ev.key === 'Enter') ||
				ev.key === ' '
			)
				this.onEvent(ev);
		},

		connect() {
			this.bindings = [
				new EventListener(
					this.element,
					'click',
					this.onEvent.bind(this)
				),
				new EventListener(
					this.element,
					'keyup',
					this.onKeyPress.bind(this)
				)
			];
		}
	});

	class Anchor {
		$create(name, el) {
			this.name = name;
			this.element = el;
			ANCHORS[name] = this;
		}

		constructor(name, el) {
			this.$create(name, el);
		}

		focus() {
			this.element.scrollIntoView();
			this.element.focus();
		}

		insert(element) {
			this.element.appendChild(element);
		}

		destroy() {
			if (ANCHORS[this.name] === this) delete ANCHORS[this.name];
		}
	}

	/**
	 * Anchors are used to interact with elements outside the component.
	 */
	directive('anchor', {
		initialize() {
			if (this.parameter) this.update(this.parameter);
		},
		connect() {
			if (!this.anchor) this.update(this.parameter);
		},
		disconnect() {
			this.anchor.destroy();
			this.anchor = null;
		},
		update(val) {
			if (this.anchor) this.anchor.destroy();

			if (val) {
				this.parameter = val;
				this.anchor = new Anchor(val, this.element);
			}
		}
	});

	directive('anchor.send', {
		connect() {
			//if (this.element === this.owner.host)
			//	throw new Error("Cannot use host element");
			if (!this.anchor) {
				const anchor = (this.anchor = cxl.anchor(this.parameter));
				anchor.insert(this.element);
				this.placed = true;
			}
		},

		disconnect() {
			if (this.placed) {
				cxl.dom.remove(this.element);
				this.placed = false;
			}
		}
	});

	directive('call', {
		update(val, state) {
			return state[this.parameter].call(state, val, this.element);
		},
		digest(state) {
			return state[this.parameter].call(state, this.value, this.element);
		}
	});

	function EventObservable(el, event) {
		return new rx.Observable(subscriber => {
			el.addEventListener(event, subscriber.next);
			return el.removeEventListener.bind(el, subscriber.next);
		});
	}

	Object.assign(cxl, {
		/// Initial value for directives
		Undefined: Undefined,
		/// Return this in a directive update function to stop the observable.
		Skip: Skip,

		ENTITIES_REGEX: /[&<]/g,
		ENTITIES_MAP: {
			'&': '&amp;',
			'<': '&lt;'
		},

		Anchor: Anchor,
		AttributeObserver: AttributeObserver,
		ChildrenObserver: ChildrenObserver,
		Compiler: Compiler,
		Directive: Directive,
		ElementChildren: ElementChildren,
		ElementList: ElementList,
		Event: Event,
		EventObservable: EventObservable,
		EventListener: EventListener,
		HTMLElement: window.HTMLElement,
		Marker: Marker,
		NodeSnapshot: NodeSnapshot,
		Template: Template,
		View: View,

		anchor(name) {
			return ANCHORS[name];
		},

		behavior: behavior,
		compiler: compiler,
		directive: directive,

		replaceParameters(path, params) {
			if (params === null || params === undefined) return path;

			if (typeof params !== 'object') params = { $: params };

			return path.replace(PARAM_REGEX, (match, key) => params[key]);
		},

		debounceRender(fn) {
			let raf = null;

			function Result() {
				const args = arguments,
					thisVal = this;

				if (raf === null)
					raf = requestAnimationFrame(() => {
						raf = null;
						Result.fn.apply(thisVal, args);
					});
			}
			Result.fn = fn;
			Result.cancel = function() {
				cancelAnimationFrame(raf);
			};

			return Result;
		},

		debounce(fn, delay) {
			var to;

			function Result() {
				var args = arguments,
					thisVal = this;

				if (to) clearTimeout(to);
				to = setTimeout(function() {
					Result.fn.apply(thisVal, args);
				}, delay);
			}
			Result.fn = fn;
			Result.cancel = function() {
				clearTimeout(to);
			};

			return Result;
		},

		each(coll, fn, scope) {
			if (Array.isArray(coll)) return coll.forEach(fn, scope);

			for (const i in coll)
				if (coll.hasOwnProperty(i)) fn.call(scope, coll[i], i);
		},

		escape(str) {
			return (
				str && str.replace(cxl.ENTITIES_REGEX, e => cxl.ENTITIES_MAP[e])
			);
		},

		escapeRegex(str) {
			return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
		},

		/** Returns a getter function with a state parameter */
		getter(expr) {
			/*jshint evil:true*/
			return (
				GETTERS[expr] ||
				(GETTERS[expr] =
					expr.indexOf('.') === -1
						? state => state[expr]
						: new Function(
								'state',
								`try{return(state.${expr});}catch(e){return null;}`
						  ))
			);
		},

		pull(ary, item) {
			const i = ary.indexOf(item);

			if (i === -1) throw 'Invalid Item';

			ary.splice(i, 1);
		},

		/** Returns a setter function with value and state parameters */
		setter(expr) {
			/*jshint evil:true*/
			return (
				SETTERS[expr] ||
				(SETTERS[expr] =
					expr.indexOf('.') === -1
						? (val, state) => (state[expr] = val)
						: new Function('val', 'state', `state.${expr}=val;`))
			);
		},

		sortBy(A, key) {
			return A.sort((a, b) =>
				a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0
			);
		},

		renderer: renderer
	});

	function source(name, subscribe) {
		directive(name, {
			connect() {
				// TODO last parameter should be subscriber, using "this" so
				// "once" logic works properly
				var teardown = subscribe(
					this.element,
					this.parameter,
					this.owner,
					this
				);

				if (typeof teardown === 'function')
					teardown = { unsubscribe: teardown };

				this.bindings = [teardown];
			}
		});
	}

	function sources(defs) {
		for (var i in defs) source(i, defs[i]);
	}

	directive('connect', {
		connect() {
			this.set(true);
		}
	});
	directive('disconnect', {
		disconnect() {
			this.set(true);
		}
	});

	sources({});

	function connectedSources(defs) {
		for (var i in defs) source(i, defs[i]);
	}

	directive('on.message', {
		initialize(el, param) {
			new EventListener(el, param, this.set.bind(this));
		}
	});

	directive('input.state', {
		connect() {
			const el = this.element,
				apply = cxl.debounce(target =>
					this.set({
						invalid: target.invalid,
						focused: target.focused,
						touched: target.touched,
						disabled: target.disabled
					})
				),
				fn = ev => apply(ev.target);
			this.bindings = [
				new EventListener(el, 'invalid', fn),
				new EventListener(el, 'focus', fn),
				new EventListener(el, 'blur', fn)
			];
		}
	});

	connectedSources({
		/**
		 * Binds to DOM element event.
		 */
		on(el, param, view, subscriber) {
			return new EventListener(
				el,
				param,
				subscriber.next.bind(subscriber)
			);
		},

		keypress(el, param, view, subscriber) {
			if (param === 'space') param = ' ';

			return new EventListener(el, 'keydown', ev => {
				if (!param || ev.key.toLowerCase() === param)
					subscriber.next(ev);
			});
		},

		'host.mutation'(el, param, view, subs) {
			const observer = new ChildrenObserver(view.host);
			return observer.subscribe(subs.next.bind(subs));
		},

		location(el, param, view, subs) {
			subs.next(window.location.hash);

			return new EventListener(window, 'hashchange', () => {
				subs.next(window.location.hash);
			});
		},

		'root.on'(el, param, view, subs) {
			return new EventListener(window, param, subs.next.bind(subs));
		},

		timer(el, param, view, subs) {
			var value = 1,
				delay = param ? view.state[param] : 1000,
				interval = setInterval(() => subs.next(value++), delay);
			return clearInterval.bind(window, interval);
		}
	});

	function operator(name, fn) {
		directive(name, function(el, param, view) {
			const d = new Directive();
			d.update = fn(el, param, view);
			return d;
		});
	}

	function operators(defs) {
		for (var i in defs) operator(i, defs[i]);
	}

	operators({
		repeat(el, param, view) {
			const tpl = new Template(el),
				marker = new Marker(el, 'repeat');
			return item => {
				view.state.$item = item;
				const html = tpl.compile(view);
				marker.insert(html);
			};
		}
	});

	function pipes(defs) {
		for (var i in defs) directive(i, { update: defs[i] });
	}

	/**
	 * Pipes are update only directives
	 */
	pipes({
		attribute(val) {
			return cxl.dom.setAttribute(
				this.element,
				this.parameter || val,
				val
			);
		},

		bool(val) {
			return val !== undefined && val !== null && val !== false;
		},

		data(val) {
			this.element.dataset[this.parameter] = val;
		},

		delay(val) {
			return new Promise(resolve => {
				setTimeout(() => resolve(val), this.parameter);
			});
		},

		empty() {
			cxl.dom.empty(this.element);
		},

		'dom.remove'(el) {
			cxl.dom.remove(el);
		},

		'event.prevent'(ev) {
			ev.preventDefault();
		},

		'event.stop'(ev) {
			ev.stopPropagation();
		},

		'event.halt': dom.event.halt,

		filter(val) {
			return val || cxl.Skip;
		},

		focus(val) {
			if (val) this.element.focus();
		},

		gate(val, state) {
			return state[this.parameter] ? val : Skip;
		},

		'focus.gate'(ev, state) {
			if (!state[this.parameter]) {
				dom.event.halt(ev);
				return Skip;
			}
		},

		'focus.enable'(value) {
			if (value) this.element.tabIndex = 0;
			else this.element.removeAttribute('tabindex');
		},

		hide(value) {
			this.element.style.display = value ? 'none' : '';
		},

		'host.trigger'(detail) {
			dom.trigger(this.owner.host, this.parameter, detail);
		},

		insert(value) {
			dom.insert(this.element, value);
		},

		len(value) {
			return Array.isArray(value)
				? value.length
				: value instanceof Set
				? value.size
				: 0;
		},

		'list.loading'(event) {
			const newVal = event.type === 'empty';
			// TODO ?
			return newVal === this.value ? cxl.Skip : newVal;
		},

		observe(observable) {
			if (this.bindings) this.bindings[0].unsubscribe();

			if (observable)
				this.bindings = [observable.subscribe(this.set.bind(this))];

			return cxl.Skip;
		},

		// TODO
		'marker.empty'() {
			if (this.element.$marker) this.element.$marker.empty();
		},

		not(value) {
			return !value;
		},

		prop(obj) {
			const res = obj && obj[this.parameter];
			return res === undefined ? null : res;
		},

		replace(val, state) {
			return cxl.replaceParameters(state[this.parameter], val);
		},

		resolve(promise) {
			return promise;
		},

		reverse(val) {
			return val && val.reverse();
		},

		show(value) {
			this.element.style.display = value ? '' : 'none';
		},

		sort(value) {
			return this.parameter
				? cxl.sortBy(value, this.parameter)
				: value && value.sort();
		},

		'style.inline'(val) {
			this.element.style[this.parameter] = val;
		},

		'style.animate'() {
			dom.setStyle(this.element, this.parameter, false, this.prefix);
			requestAnimationFrame(() => {
				dom.setStyle(this.element, this.parameter, true, this.prefix);
			});
		},

		text(value) {
			dom.setContent(this.element, value);
		},

		toggle(val, state) {
			return (state[this.parameter] = !state[this.parameter]);
		}
	});

	cxl.anchor.anchors = ANCHORS;

	/**
	 * Behaviors are directives with independent state
	 */
	function behavior(name, def) {
		if (typeof def === 'string') def = { bindings: def };

		directive(name, {
			initialize(el) {
				const state = Object.assign({}, def),
					view = (this.view = new View(state, this.owner.host));
				// TODO keep this here?
				state.$behavior = this;
				compiler.parseBinding(el, state.bindings, view);
				this.bindings = view.bindings;
			},

			connect() {
				this.view.connect();
			},
			disconnect() {
				this.view.disconnect();
			}
		});
	}
})(this.cxl);

(cxl=>{"use strict";
(cxl => {
	'use strict';

	const COMPONENTS = {};

	/**
	 * Persist attributes from state.
	 */
	class AttributeMonitor extends cxl.Directive {
		digest(state) {
			const el = this.element,
				attr = this.parameter,
				newVal = state[attr];
			if (newVal !== this.value) {
				// Automatically reflect the attribute if it is a boolean
				if (newVal === true) el.setAttribute(attr, '');
				else if (newVal === false) el.removeAttribute(attr);

				if (el.$$attributeObserver)
					el.$$attributeObserver.trigger(attr);
			}

			return newVal;
		}
	}

	class ResourceManager {
		push(resource) {
			if (!this.$resources) this.$resources = [];

			this.$resources.push(resource);
		}

		destroy() {
			if (this.$resources)
				this.$resources.forEach(b => (b.destroy || b.unsubscribe)());
		}
	}

	function onMutation(events) {
		for (const mutation of events) {
			const node = mutation.target,
				newVal = node.getAttribute(mutation.attributeName);
			node.$view.setAttribute(mutation.attributeName, newVal);
		}
	}

	class ComponentFactory {
		$attributes(node, attributes) {
			const view = node.$view;

			attributes.forEach(a => {
				view.bindings.push(new AttributeMonitor(node, a, view));
			});

			const observer = (view.attributeObserver = new MutationObserver(
				onMutation
			));
			observer.observe(node, {
				attributes: true,
				attributeFilter: attributes
			});
		}

		$bindings(component, value) {
			cxl.compiler.parseBinding(component, value, component.$view);
		}

		$attachShadow(node) {
			return node.attachShadow({ mode: 'open' });
		}

		$renderTemplate(node, template) {
			const parent = this.$attachShadow(node),
				nodes = template.compile(node.$view);
			parent.appendChild(nodes);
		}

		$initializeTemplate(node, meta) {
			if (!meta.$template) {
				if (meta.templateId)
					meta.$template = cxl.Template.fromId(meta.templateId);
				else if (meta.template)
					meta.$template = new cxl.Template(meta.template);
			}

			if (meta.styles && !meta.$styles)
				meta.$styles = new cxl.css.StyleSheet(meta);
		}

		createComponent(meta, node) {
			const view = (node.$view = new cxl.View(meta.controller, node)),
				state = view.state;

			if (meta.attributes) {
				meta.attributes.forEach(function(a) {
					if (node.hasAttribute(a))
						state[a] = node.getAttribute(a) || true;
					// TODO verify
					else if (state[a] === undefined) state[a] = null;
				});
			}

			if (meta.initialize) meta.initialize.call(node, view.state);

			this.$initializeTemplate(node, meta);

			if (meta.$template) {
				this.$renderTemplate(node, meta.$template);
				// Commit all the template bindings.
				if (view.bindings.length) cxl.renderer.commitDigest(view);
			}

			// Initialize Attributes and bindings after the first commit
			if (meta.attributes) this.$attributes(node, meta.attributes);

			if (meta.bindings) this.$bindings(node, meta.bindings);

			return node;
		}
	}

	const factory = new ComponentFactory();

	factory.components = COMPONENTS;

	class ComponentDefinition {
		$attributes(prototype, value) {
			value.forEach(function(a) {
				Object.defineProperty(prototype, a, {
					enumerable: true,
					name: a,
					get() {
						return this.$view.state[a];
					},
					set(newVal) {
						this.$view.set(a, newVal);
						return newVal;
					}
				});
			});
		}

		$methods(prototype, value) {
			value.forEach(function(m) {
				prototype[m] = function() {
					const result = this.$view.state[m].apply(
						this.$view.state,
						arguments
					);
					this.$view.digest();
					return result;
				};
			});
		}

		$registerElement(name, Constructor) {
			window.customElements.define(name, Constructor);
		}

		constructor(meta, controller) {
			if (controller)
				meta.controller =
					typeof controller === 'function'
						? controller
						: this.normalizeController(controller);

			if (meta.extend) meta = this.extendComponent(meta, meta.extend);

			this.name = meta.name;
			this.meta = meta;
			this.Component = this.componentConstructor();

			if (this.name) {
				COMPONENTS[this.name] = this;
				this.$registerElement(this.name, this.Component);
			}
		}

		extend(def) {
			const parentDef = this.meta,
				result = Object.assign({}, parentDef, def);
			if (def.events && parentDef.events)
				result.events = parentDef.events.concat(def.events);
			if (def.methods && parentDef.methods)
				result.methods = parentDef.methods.concat(def.methods);
			if (def.attributes && parentDef.attributes)
				result.attributes = parentDef.attributes.concat(def.attributes);

			if (def.styles && parentDef.styles) {
				let css = (result.styles = Array.isArray(parentDef.styles)
					? [].concat(parentDef.styles)
					: [parentDef.styles]);

				if (Array.isArray(def.styles))
					result.styles = css.concat(def.styles);
				else css.push(def.styles);
			}

			if (def.controller && parentDef.controller)
				result.controller.prototype = Object.assign(
					{},
					parentDef.controller.prototype,
					def.controller.prototype
				);

			if (def.bindings && parentDef.bindings)
				result.bindings = parentDef.bindings + ' ' + def.bindings;

			return result;
		}

		extendComponent(def, parent) {
			return (parent instanceof ComponentDefinition
				? parent
				: COMPONENTS[parent]
			).extend(def);
		}

		componentConstructor() {
			const def = this,
				meta = def.meta;

			class Component extends cxl.HTMLElement {
				constructor() {
					super();
					factory.createComponent(def.meta, this);
				}

				connectedCallback() {
					// FIX for safari, component not always have attributes initialized
					/*if (meta.attributes) {
						meta.attributes.forEach(a => {
							if (this.hasAttribute(a))
								this.$view.state[a] =
									this.getAttribute(a) || true;
						});
					}*/

					this.$view.connect();
				}

				disconnectedCallback() {
					this.$view.disconnect();
				}
			}

			if (meta.attributes)
				this.$attributes(Component.prototype, meta.attributes);

			if (meta.methods) this.$methods(Component.prototype, meta.methods);

			return Component;
		}

		normalizeController(controller) {
			var State = controller.hasOwnProperty('constructor')
				? controller.constructor
				: function Controller() {};

			State.prototype = controller;

			return State;
		}
	}

	Object.assign(cxl, {
		ResourceManager: ResourceManager,
		ComponentDefinition: ComponentDefinition,
		ComponentFactory: ComponentFactory,
		componentFactory: factory,

		component(meta, controller) {
			var def = new ComponentDefinition(meta, controller);
			return cxl.dom.bind(cxl, def.name);
		},

		extendComponent(name, meta) {
			const parentDef = COMPONENTS[name];
			parentDef.meta = parentDef.extend(meta);
		},

		extendStyles(name, styles) {
			return cxl.extendComponent(name, { styles: styles });
		}
	});
})(this.cxl);

(cxl => {
	'use strict';

	const PSEUDO = {
			focus: ':focus',
			hover: ':hover',
			empty: ':empty',
			active: ':active',
			firstChild: ':first-child',
			lastChild: ':last-child'
		},
		PREFIX_REGEX = /\./g,
		SNAKE_REGEX = /[A-Z]/g,
		SNAKE_CSS = {
			webkitOverflowScrolling: '-webkit-overflow-scrolling'
		},
		UNIT = 'px',
		css = {};
	function toSnake(name) {
		return (SNAKE_CSS[name] = name.replace(
			SNAKE_REGEX,
			m => '-' + m.toLowerCase()
		));
	}

	class RGBA {
		constructor(r, g, b, a) {
			this.r = r < 0 ? 0 : r > 255 ? 255 : r;
			this.g = g < 0 ? 0 : g > 255 ? 255 : g;
			this.b = b < 0 ? 0 : b > 255 ? 255 : b;
			this.a = a === undefined ? 1 : a < 0 ? 0 : a > 1 ? 1 : a;
		}

		luminance() {
			//return 0.2126*((this.r/255)^2.2) + 0.7151*((this.g/255)^2.2) + 0.0721*((this.b/255)^2.2);
			return (0.2126 * this.r + 0.7152 * this.g + 0.0722 * this.b) / 255;
		}

		blend(rgba) {
			const a = 1 - (1 - rgba.a) * (1 - this.a),
				r =
					a === 0
						? 0
						: (rgba.r * rgba.a) / a +
						  (this.r * this.a * (1 - rgba.a)) / a,
				g =
					a === 0
						? 0
						: (rgba.g * rgba.a) / a +
						  (this.g * this.a * (1 - rgba.a)) / a,
				b =
					a === 0
						? 0
						: (rgba.b * rgba.a) / a +
						  (this.b * this.a * (1 - rgba.a)) / a;
			return new RGBA(r, g, b, a);
		}

		multiply(p) {
			return new RGBA(this.r * p, this.g * p, this.b * p, this.a);
		}

		alpha(a) {
			return new RGBA(this.r, this.g, this.b, a);
		}

		toString() {
			return (
				'rgba(' +
				(this.r | 0) +
				',' +
				(this.g | 0) +
				',' +
				(this.b | 0) +
				',' +
				this.a +
				')'
			);
		}
	}

	function rgba(r, g, b, a) {
		return new RGBA(r, g, b, a);
	}

	const COLORS = {
		elevation: rgba(0, 0, 0, 0.26),
		primary: rgba(0x15, 0x65, 0xc0),
		// 0.14 opacity will pass accessibility contrast requirements
		get primaryLight() {
			return this.primary.alpha(0.14);
		},

		secondary: rgba(0xf9, 0xaa, 0x33),
		surface: rgba(0xff, 0xff, 0xff),
		error: rgba(0xb0, 0x00, 0x20),

		onPrimary: rgba(0xff, 0xff, 0xff),
		get onPrimaryLight() {
			return this.primary;
		},
		onSecondary: rgba(0, 0, 0),
		onSurface: rgba(0, 0, 0),
		// TOFO better name?
		get onSurface12() {
			return this.onSurface.alpha(0.12);
		},
		onError: rgba(0xff, 0xff, 0xff),

		get background() {
			return this.surface;
		},
		get link() {
			return this.primary;
		},
		get headerText() {
			return this.onSurface.alpha(0.6);
		},
		get divider() {
			return this.onSurface.alpha(0.16);
		}
	};
	class StyleSheet {
		constructor(meta, native) {
			this.tagName = meta.name;
			this.$selector = meta.global ? this.tagName : ':host';
			this.global = meta.global;

			if (native) this.$native = native;
			else this.$attachStyle(meta);

			this.reset(meta.styles);
		}

		insertStyles(styles) {
			if (Array.isArray(styles))
				return styles.forEach(this.insertStyles, this);

			for (var i in styles) this.insertRule(i, styles[i]);
		}

		$attachStyle(meta) {
			if (meta.$template) {
				this.$native = document.createElement('STYLE');
				meta.$template.$content.appendChild(this.$native);
			} else this.$createTemplate(meta);
		}

		$createTemplate(meta) {
			var src = '<style></style><slot></slot>';
			meta.$template = new cxl.Template(src);
			this.$native = meta.$template.$content.childNodes[0];
		}

		$renderGlobal() {
			var glob = !this.global && css.globalStyles;
			return (glob && this.$toCSS(glob.$classes)) || '';
		}

		$render(css) {
			this.$native.innerHTML = this.$renderGlobal() + css;
		}

		$toCSS(classes) {
			var css = '';

			classes.forEach(
				c => (css += c.toCSS(this.$selector, this.$prefix))
			);

			return css;
		}

		reset(styles) {
			if (this.$classes) this.$native.innerHTML = '';

			this.$classes = [];

			if (styles) this.insertStyles(styles);

			this.$render(this.$toCSS(this.$classes));
		}

		// Render styles needs to be called after insert styles.
		applyStyles() {
			this.$render(this.$toCSS(this.$classes));
		}

		insertRule(rule, styles) {
			var result = new Rule(rule, new Style(styles));
			this.$classes.push(result);
			return result;
		}
	}

	function getUnit(n) {
		return typeof n === 'string' ? n : n ? n + UNIT : '0';
	}

	class Style {
		constructor(prop, style) {
			this.$value = {};
			this.$style = style || {};

			if (prop) this.set(prop);
		}

		get animation() {
			return this.$value.animation;
		}

		set animation(val) {
			this.$value.animation = val;

			if (!this.$keyframes) this.$keyframes = {};

			const keyframe = css.animation[val];

			this.$keyframes[val] = keyframe.keyframes;
			this.$style.animation = keyframe.value;
		}

		get elevation() {
			return this.$value.elevation;
		}

		set elevation(x) {
			this.$value.elevation = x;
			this.$style.zIndex = x;
			this.$style.boxShadow =
				x +
				UNIT +
				' ' +
				x +
				UNIT +
				' ' +
				3 * x +
				UNIT +
				' var(--cxl-elevation)';
		}

		set font(name) {
			const fontStyle = css.typography[name];
			this.$value.font = name;
			fontStyle.applyTo(this.$style);
		}

		get font() {
			return this.$value.font;
		}

		set state(name) {
			const state = css.states[name];
			this.$value.state = name;
			state.applyTo(this.$style);
		}

		get state() {
			return this.$value.state;
		}

		set userSelect(val) {
			this.$style.userSelect = this.$style.msUserSelect = this.$style[
				'-ms-user-select'
			] = this.$style.mozUserSelect = this.$style[
				'-moz-user-select'
			] = this.$value.userSelect = val;
		}

		get userSelect() {
			return this.$value.userSelect;
		}

		set variables(val) {
			this.$value.variables = val;
		}

		get variables() {
			return this.$value.variables;
		}

		set(styles) {
			for (var i in styles) this[i] = styles[i];
		}

		get scaleX() {
			return this.$value.scaleX;
		}
		set scaleX(val) {
			this.$value.scaleX = val;
			this.$transform();
		}
		get scaleY() {
			return this.$value.scaleY;
		}
		set scaleY(val) {
			this.$value.scaleY = val;
			this.$transform();
		}

		set rotate(val) {
			this.$value.rotate = val;
			this.$transform();
		}

		get rotate() {
			return this.$value.rotate;
		}

		get translateX() {
			return this.$value.translateX;
		}
		get translateY() {
			return this.$value.translateY;
		}
		set translateX(x) {
			this.$value.translateX = x;
			this.$transform();
		}
		set translateY(y) {
			this.$value.translateY = y;
			this.$transform();
		}

		set overflowY(val) {
			this.$value.overflowY = this.$style.overflowY = val;
		}

		get overflowY() {
			return this.$value.overflowY;
		}

		set overflowScrolling(val) {
			this.$style.webkitOverflowScrolling = val;
		}

		get overflowScrolling() {
			return this.$style.webkitOverflowScrolling;
		}

		applyTo(style) {
			for (let i in this.$style) style[i] = this.$style[i];
		}

		$transform() {
			var v = this.$value;

			this.$style.transform =
				(v.translateX !== undefined || v.translateY !== undefined
					? 'translate(' +
					  getUnit(v.translateX) +
					  ',' +
					  getUnit(v.translateY) +
					  ') '
					: '') +
				(v.translateZ !== undefined
					? 'translateZ(' + getUnit(v.translateZ) + ') '
					: '') +
				(v.scaleX !== undefined || v.scaleY !== undefined
					? 'scale(' +
					  (v.scaleX === undefined ? 1 : v.scaleX) +
					  ',' +
					  (v.scaleY === undefined ? 1 : v.scaleY) +
					  ')'
					: '') +
				(v.rotate !== undefined ? 'rotate(' + v.rotate + ')' : '');
		}

		$toCSS() {
			var result = this.reset || '',
				vars = this.$value.variables,
				val,
				i;

			if (vars)
				for (i in vars) result += '--cxl-' + i + ': ' + vars[i] + ';';

			for (i in this.$style) {
				val = this.$style[i];

				if (val !== null && val !== undefined && val !== '')
					result +=
						(SNAKE_CSS[i] || toSnake(i)) +
						':' +
						this.$style[i] +
						';';
			}

			return result;
		}
	}

	function property(setter) {
		return name =>
			Object.defineProperty(Style.prototype, name, {
				get() {
					return this.$value[name];
				},
				set(val) {
					this.$value[name] = val;
					this.$style[name] = setter(val);
				}
			});
	}

	['backgroundColor', 'color', 'borderColor'].forEach(
		property(val => (css.colors[val] ? 'var(--cxl-' + val + ')' : val))
	);

	[
		'top',
		'left',
		'right',
		'bottom',
		'marginTop',
		'lineHeight',
		'marginLeft',
		'marginRight',
		'marginBottom',
		'margin',
		'height',
		'width',
		'flexBasis',
		'paddingTop',
		'paddingLeft',
		'paddingRight',
		'paddingBottom',
		'fontSize',
		'padding',
		'outline',
		'borderBottom',
		'borderTop',
		'borderLeft',
		'borderRight',
		'border',
		'borderRadius',
		'borderWidth',
		'gridGap'
	].forEach(
		property(val => (typeof val === 'string' ? val : (val || 0) + UNIT))
	);

	[
		'alignItems',
		'display',
		'position',
		'boxSizing',
		'boxShadow',
		'opacity',
		'fontFamily',
		'fontWeight',
		'fontStyle',
		'background',
		'cursor',
		'overflowX',
		'filter',
		'textDecoration',
		'borderStyle',
		'transition',
		'textTransform',
		'textAlign',
		'flexGrow',
		'flexShrink',
		'animationDuration',
		'pointerEvents',
		'alignContent',
		'flexDirection',
		'justifyContent',
		'whiteSpace',
		'scrollBehavior',
		'transformOrigin',
		'alignSelf',
		'wordBreak',
		'verticalAlign',

		'gridTemplateRows',
		'gridTemplateColumns',
		'gridColumnEnd',
		'gridColumnStart'
	].forEach(property(val => val));

	class Rule {
		constructor(name, style) {
			this.rule = name;
			this.style = style;
		}

		$getMediaQuery(selector, minWidth, cssStr) {
			const bp = css.breakpoints[minWidth] + UNIT;

			return '@media(min-width:' + bp + '){' + selector + cssStr + '}';
		}

		$getSelector(tag, rule, state) {
			return (
				(tag === ':host' && state
					? ':host(' + state + ')'
					: tag + state) + (rule ? ' ' + rule : '')
			);
		}

		$parseParts(parts, selector, prefix, css) {
			var part,
				media,
				state = '',
				name = parts[0] ? '.' + parts[0] : '';

			for (var i = 1; i < parts.length; i++) {
				part = parts[i];

				if (
					part === 'small' ||
					part === 'medium' ||
					part === 'large' ||
					part === 'xlarge'
				)
					media = part;
				else state += part in PSEUDO ? PSEUDO[part] : '[' + part + ']';
			}

			if (prefix && name) name = name.replace(PREFIX_REGEX, '.' + prefix);

			if (media)
				return this.$getMediaQuery(
					this.$getSelector(selector, name, state),
					media,
					css
				);

			return this.$getSelector(selector, name, state) + css;
		}

		$renderKeyframes() {
			var k = this.style.$keyframes,
				result = '';

			for (var i in k) result += '@keyframes cxl-' + i + '{' + k[i] + '}';

			return result;
		}

		$toCSS(selector, prefix) {
			var rule = this.rule,
				css = '{' + this.style.$toCSS() + '}';

			if (css === '{}') return '';

			if (rule === '$') return selector + css;

			if (rule === '*') return selector + ',' + selector + ' *' + css;

			return this.$parseParts(rule.split('$'), selector, prefix, css);
		}

		toCSS(selector, prefix) {
			var result = '';

			if (this.style.$keyframes) result = this.$renderKeyframes();

			return result + this.$toCSS(selector, prefix);
		}
	}

	function applyStyles() {
		// Get Variables
		const typo = css.typography,
			states = css.states,
			variables = (css.appliedVariables = Object.assign(
				{},
				css.variables
			));
		for (var i in css.colors) variables[i] = css.colors[i];

		for (i in typo) {
			let css = typo[i];

			if (!(css instanceof Style)) {
				typo[i] = new Style(
					Object.assign(
						{
							fontFamily: 'var(--cxl-font)'
						},
						css
					)
				);
			}
		}

		for (i in states)
			if (!(states[i] instanceof Style)) states[i] = new Style(states[i]);

		css.rootStyles.reset({
			$: { backgroundColor: 'background', variables: variables }
		});
	}

	class RootStyles extends StyleSheet {
		constructor() {
			const rootCSS = document.createElement('STYLE');
			document.head.appendChild(rootCSS);

			super({ name: ':root', global: true }, rootCSS);
		}
	}

	cxl.css = Object.assign(css, {
		Rule: Rule,
		Style: Style,
		StyleSheet: StyleSheet,

		animation: {
			spin: {
				keyframes:
					'0% { transform: rotate(0); } to { transform: rotate(360deg); }',
				value: 'cxl-spin 2s infinite linear'
			},
			pulse: {
				keyframes:
					'0% { transform: rotate(0); } to { transform: rotate(360deg); }',
				value: 'cxl-pulse 1s infinite steps(8)'
			},
			expand: {
				keyframes:
					'0% { transform: scale(0,0); } 100% { transform: scale(1,1); }',
				value: 'cxl-expand var(--cxl-speed) 1 ease-in'
			},
			fadeIn: {
				keyframes:
					'0% { display: block; opacity: 0; } 100% { opacity: 1; }',
				value: 'cxl-fadeIn var(--cxl-speed) linear'
			},
			wait: {
				keyframes: `
0% { transform: translateX(0) scaleX(0) }
33% { transform: translateX(0) scaleX(0.75)}
66% { transform: translateX(75%) scaleX(0.25)}
100%{ transform:translateX(100%) scaleX(0) }
			`,
				value: 'cxl-wait 1s infinite linear'
			}
		},

		breakpoints: { small: 480, medium: 960, large: 1280, xlarge: 1600 },

		colors: COLORS,

		colorsPrimary: cxl.extend({}, COLORS, {
			surface: COLORS.primary,
			onSurface: COLORS.onPrimary,
			primary: COLORS.secondary,
			onPrimary: COLORS.onSecondary,
			link: COLORS.onPrimary,
			error: rgba(0xff, 0x6e, 0x40),
			onError: rgba(0, 0, 0)
		}),

		fonts: {},

		globalStyles: new StyleSheet({
			name: 'cxl-root',
			global: true,
			styles: {
				$: {
					display: 'block',
					reset: '-webkit-tap-highlight-color:transparent;',
					fontFamily: 'var(--cxl-font)',
					fontSize: 'var(--cxl-fontSize)',
					verticalAlign: 'middle'
				},
				'*': {
					boxSizing: 'border-box',
					transition:
						'opacity var(--cxl-speed), transform var(--cxl-speed), box-shadow var(--cxl-speed), filter var(--cxl-speed)'
				}
			}
		}),

		rgba: rgba,

		// Stylesheet used for variables and other :root properties
		rootStyles: new RootStyles(),

		states: {
			active: { filter: 'invert(0.2)' },
			focus: {
				outline: 0,
				filter: 'invert(0.2) saturate(2) brightness(1.1)'
			},
			hover: { filter: 'invert(0.15) saturate(1.5) brightness(1.1)' },
			disabled: {
				cursor: 'default',
				filter: 'saturate(0)',
				opacity: 0.38,
				pointerEvents: 'none'
			},
			none: { filter: 'none', opacity: 1 }
		},

		variables: {
			// Animation speed
			speed: '0.2s',
			font: 'Roboto, sans-serif',
			fontSize: '16px',
			fontMonospace: 'monospace'
		},

		typography: {
			default: {
				fontWeight: 400,
				fontSize: 'var(--cxl-fontSize)',
				letterSpacing: 'normal'
			},
			caption: { fontSize: 12, letterSpacing: 0.4 },
			h1: { fontWeight: 300, fontSize: 96, letterSpacing: -1.5 },
			h2: { fontWeight: 300, fontSize: 60, letterSpacing: -0.5 },
			h3: { fontSize: 48 },
			h4: { fontSize: 34, letterSpacing: 0.25 },
			h5: { fontSize: 24 },
			h6: { fontSize: 20, fontWeight: 400, letterSpacing: 0.15 },
			title: { fontSize: 18, lineHeight: 24 },
			subtitle: { fontSize: 16, lineHeight: 22, letterSpacing: 0.15 },
			subtitle2: { fontSize: 14, lineHeight: 18, letterSpacing: 0.1 },
			button: {
				fontSize: 14,
				lineHeight: 20,
				letterSpacing: 1.25,
				textTransform: 'uppercase'
			},
			code: { fontFamily: 'var(--fontMonospace)' }
		},

		extend(def) {
			if (def.variables) cxl.extend(this.variables, def.variables);

			if (def.colors) cxl.extend(this.colors, def.colors);

			if (def.typography) cxl.extend(this.typography, def.typography);

			if (def.states) cxl.extend(this.states, def.states);

			applyStyles();
		},

		registerFont(fontFamily, src) {
			var style = document.createElement('STYLE'),
				url = typeof src === 'string' ? src : src.url;
			this.fonts[fontFamily] = src;

			style.innerHTML =
				'@font-face{font-family:"' +
				fontFamily +
				'"' +
				(src.weight ? ';font-weight:' + src.weight : '') +
				';src:url("' +
				url +
				'");}';

			document.head.appendChild(style);

			return style;
		}
	});

	applyStyles();
})(this.cxl);

(cxl => {
	'use strict';

	if (window.customElements && !window.$$cxlShady) return;

	var started, scheduled;

	const registry = {},
		observer = new MutationObserver(onMutation);
	cxl.$$shadyUpgrade = node => walkChildren(node, upgradeConnect);
	cxl.$$shadyCustomElements = true;

	function upgrade(node) {
		if (node.tagName && !node.$view) {
			const Component = registry[node.tagName];

			if (Component) new Component(node);
		}
	}

	function connect(node) {
		node.$$connect = undefined;

		if (node.$$cxlConnected === false) {
			node.$view.connect();
			node.$$cxlConnected = true;
		}
	}

	function disconnect(node) {
		node.$$connect = undefined;

		if (node.$$cxlConnected === true) {
			node.$view.disconnect();
			node.$$cxlConnected = false;
		}
	}

	function upgradeConnect(node) {
		upgrade(node);
		connect(node);
	}

	function walkChildren(node, method) {
		if (node.childNodes) {
			method(node);
			walk(node.firstChild, method);

			if (node.shadowRoot) walk(node.shadowRoot.firstChild, method);
		}

		return node;
	}

	function walk(node, method) {
		if (node) {
			walkChildren(node, method);
			walk(node.nextSibling, method);
		}
	}

	function override(obj, fn) {
		const original = obj[fn];
		obj[fn] = function() {
			const node = original.apply(this, arguments);

			if (node && node.childNodes) walkChildren(node, upgrade);

			return node;
		};
	}

	function onMutation(event) {
		if (!started) return;

		const nodes = [];

		event.forEach(function(record) {
			for (var node of record.removedNodes) {
				if (node.tagName && node.$$connect === undefined)
					nodes.push(node);

				node.$$connect = disconnect;
			}

			for (node of record.addedNodes) {
				if (node.tagName && node.$$connect === undefined)
					nodes.push(node);

				node.$$connect = upgradeConnect;
			}
		});

		nodes.forEach(n => n.$$connect && walkChildren(n, n.$$connect));
	}

	function observe() {
		walkChildren(document.body, upgradeConnect);
		observer.observe(document.body, { subtree: true, childList: true });
		started = true;
	}

	function debouncedWalk() {
		if (scheduled) return;

		scheduled = true;
		setTimeout(() => {
			scheduled = false;
			walkChildren(document.body, upgradeConnect);
		});
	}

	Object.assign(cxl.ComponentDefinition.prototype, {
		$registerElement(name, Constructor) {
			registry[name.toUpperCase()] = Constructor;

			if (started) debouncedWalk();
		},

		componentConstructor() {
			const me = this;

			class Component {
				constructor(node) {
					node.$$cxlConnected = false;

					if (me.meta.attributes)
						me.$attributes(node, me.meta.attributes);

					if (me.meta.methods) me.$methods(node, me.meta.methods);

					cxl.componentFactory.createComponent(me.meta, node);
				}
			}

			return Component;
		}
	});

	override(cxl.Template.prototype, 'clone');

	const createElement = cxl.dom.createElement;

	cxl.dom.createElement = function() {
		const result = createElement.apply(cxl, arguments);
		return walkChildren(result, upgrade);
	};

	window.addEventListener('DOMContentLoaded', observe);
})(this.cxl);

(cxl => {
	'use strict';

	if (!window.$$cxlShady && window.Element.prototype.attachShadow) return;

	const directives = cxl.compiler.directives;
	cxl.$$shadyShadowDOM = true;

	Object.assign(cxl.css.StyleSheet.prototype, {
		$attachStyle: function() {
			this.$native = document.createElement('STYLE');
			document.head.appendChild(this.$native);
			this.$selector = this.tagName;
			this.$prefix = this.tagName + '--';
		}
	});

	cxl.dom.setStyle = function(el, className, enable, prefix) {
		el.classList[enable || enable === undefined ? 'add' : 'remove'](
			prefix + className
		);
	};

	// CSS Apply style with prefix
	directives[
		'style.animate'
	].prototype.initialize = directives.style.prototype.initialize = function() {
		this.prefix = this.owner.host
			? this.owner.host.tagName.toLowerCase() + '--'
			: '';
	};

	function $indexOf(child) {
		var parent = child.parentNode;

		if (!parent) return null;

		var i = Array.prototype.indexOf.call(parent.childNodes, child);

		if (i === -1) throw 'Invalid Node';

		return i;
	}

	function $extendChild(child) {
		if (child.$cxl) return child;

		const parentNode = Object.getOwnPropertyDescriptor(
			Node.prototype,
			'parentNode'
		);
		//	nextSibling = Object.getOwnPropertyDescriptor(Node.prototype, 'nextSibling')
		cxl.extend(child, {
			$cxl: true,

			get parentNode() {
				const parent = this.$parentNode;

				if (!parent) return this.$component || null;

				if (parent.tagName === 'SLOT' && parent.$component)
					return parent.$component;

				if (parent.shadowRoot) return parent.shadowRoot;

				return parent;
			},

			get nextSibling() {
				var i = $indexOf(this);
				return i !== null && this.parentNode.childNodes[i + 1];
			}
		});

		Object.defineProperty(child, '$parentNode', parentNode);

		return child;
	}

	cxl.extend(cxl.ElementChildren.prototype, {
		get first() {
			var el = this.el.childNodes[0];
			return el.tagName ? el : this.nextTo(el);
		},

		get last() {
			var el = this.el.childNodes[this.el.childNodes.length - 1];
			return el.tagName ? el : this.previousTo(el);
		},

		nextTo(el) {
			if (!this.el.$indexOf) return el.nextElementSibling;

			var i = this.el.$indexOf(el);

			do {
				i++;
				el = this.el.childNodes[i];
			} while (el && !el.tagName);

			return el;
		},

		previousTo(el) {
			if (!this.el.$indexOf) return el.previousElementSibling;

			var i = this.el.$indexOf(el);

			do {
				i--;
				el = this.el.childNodes[i];
			} while (el && !el.tagName);

			return el;
		}
	});

	function $extendComponent(component, shadow) {
		cxl.extend(component, {
			$appendChild: component.appendChild.bind(component),
			$removeChild: component.removeChild.bind(component),

			shadowRoot: shadow,
			childNodes: Array.prototype.slice.call(component.childNodes, 0),

			get firstChild() {
				return this.childNodes[0];
			},

			get lastChild() {
				return this.childNodes.length
					? this.childNodes[this.childNodes.length - 1]
					: null;
			},

			$indexOf(child) {
				var i = this.childNodes.indexOf(child);

				if (i === -1) throw 'Invalid Node';

				return i;
			},

			appendChild(child) {
				this.insertBefore(child);
			},

			insertBefore(child, next) {
				if (child instanceof DocumentFragment) {
					while (child.firstChild)
						this.insertBefore(child.firstChild, next);

					return;
				}

				if (next) this.childNodes.splice(this.$indexOf(next), 0, child);
				else this.childNodes.push(child);

				$extendChild(child);
				$assignSlot(this, child);

				//this.shadowRoot.$updateSlots();
			},

			removeChild(child) {
				this.childNodes.splice(this.$indexOf(child), 1);

				if (child.$parentNode) {
					child.$parentNode.removeChild(child);
					child.$component = null;
				}
			}
		});

		component.childNodes.forEach($extendChild);

		function isParent(child, component) {
			do {
				if (child === component) return true;
			} while ((child = child.parentNode));
		}

		function eventHandlerStop(ev) {
			if (ev.$$handled) return;

			ev.$$handled = true;

			if (isParent(ev.target, component)) return;

			ev.stopImmediatePropagation();
			ev.stopPropagation();
		}

		function eventHandler(ev) {
			if (ev.$$handled) return;

			ev.$$handled = true;

			if (isParent(ev.target)) return;

			Object.defineProperty(ev, 'target', { value: component });
		}

		const allowCross = [
			'onblur',
			'onfocus',
			'onfocusin',
			'onfocusout',
			'onclick',
			'ondblclick',
			'onmousedown',
			'onmouseenter',
			'onmouseleave',
			'onmousemove',
			'onmouseover',
			'onwheel',
			'onmouseout',
			'onmouseup',
			'ontouchstart',
			'ontouchend',
			'ontouchmove',
			'ontouchcancel',
			'onpointerenter',
			'onpointerdown',
			'onpointermove',
			'onpointerup',
			'onpointercancel',
			'onpointerout',
			'onpointerleave',
			'ongotpointercapture',
			'onlostpointercapture',
			'ondragenter',
			'ondragleave',
			'ondragover',
			'onkeypress',
			'onbeforeinput',
			'oninput',
			'onkeydown',
			'onkeyup',
			'oncompositionsstart',
			'oncompositionupdate',
			'oncompositionend',
			'ondragstart',
			'ondrag',
			'ondragend',
			'ondrop'
		];

		// Catch Events
		for (var prop in component)
			if (prop.indexOf('on') === 0)
				component.addEventListener(
					prop.slice(2),
					allowCross.indexOf(prop) === -1
						? eventHandlerStop
						: eventHandler,
					{ passive: true }
				);
	}

	function $findSlotByName(slots, name) {
		return slots.find(slot => name === slot.parameter);
	}

	function $findSlot(host, child) {
		const slots = host.$view.slots;

		if (slots) {
			const slotName = child.getAttribute && child.getAttribute('slot');

			const slot =
				(slotName && $findSlotByName(slots, slotName)) ||
				(child.matches &&
					slots.find(
						slot => slot.parameter && child.matches(slot.parameter)
					)) ||
				host.$view.defaultSlot;
			return slot && slot.slot;
		}
	}

	function $assignSlot(host, child) {
		// Assign Slots
		const slot = $findSlot(host, child);

		if (slot) slot.appendChild(child);
		else {
			if (child.$parentNode) {
				if (child.$parentNode === host) host.$removeChild(child);
				else child.$parentNode.removeChild(child);
			}

			child.$component = host;
		}
	}

	function $extendShadow(host) {
		const fragment = {},
			slots = [];
		cxl.extend(fragment, {
			childNodes: host.childNodes,
			parentNode: null,
			host: host,
			$slots: slots,
			$insertBefore: host.insertBefore.bind(host),
			$removeChild: host.removeChild.bind(host),

			get firstChild() {
				return this.childNodes[0];
			},

			appendChild(child) {
				return this.insertBefore(child);
			},

			insertBefore(child, next) {
				if (child instanceof DocumentFragment) {
					while (child.firstChild)
						this.insertBefore(child.firstChild, next);

					return;
				}

				this.$insertBefore($extendChild(child), next);
			},

			removeChild(el) {
				return this.$removeChild(el);
			},

			$updateSlots() {
				host.childNodes.forEach(c => $assignSlot(host, c));
			}
		});

		return fragment;
	}

	const SLOT_INHERIT = ['display', 'align-items'],
		isEdge = navigator.userAgent.indexOf('Edge') !== -1;

	function displayContentsFix(el) {
		SLOT_INHERIT.forEach(style => (el.style[style] = 'inherit'));
	}

	function $extendSlot(slot, component) {
		if (isEdge) {
			displayContentsFix(slot);
			slot.style.flexGrow = 1;
		}

		cxl.extend(slot, {
			$component: component,
			get firstChild() {
				return null;
			}
		});
	}

	cxl.ComponentFactory.prototype.$attachShadow = function(el) {
		var native = $extendShadow(el);

		$extendComponent(el, native);

		native.$updateSlots();

		return native;
	};

	const oldRegister = cxl.View.prototype.registerSlot;

	Object.assign(cxl.View.prototype, {
		registerSlot(slot) {
			oldRegister.call(this, slot);

			const shadow = this.host.shadowRoot;

			$extendSlot(slot.slot, this.host);

			if (shadow) {
				shadow.$slots.push(slot.slot);
				shadow.$updateSlots();
			}
		}
	});
})(this.cxl);

(cxl => {

const
	directive = cxl.directive
;

directive('aria.prop', {

	initialize()
	{
		const view = this.element.$view;

		if (view)
		{
			// TODO keep here?
			const states = view.$ariaStates || (view.$ariaStates = []);
			states.push('aria-' + this.parameter);
		}
	},

	digest()
	{
		this.digest = null;
		return this.update(true);
	},

	update(val)
	{
		if (val===undefined || val===null)
			val = false;

		this.element.setAttribute('aria-' + this.parameter, val);
	}

});

directive('aria.level', {
	digest()
	{
		this.digest = null;
		return this.update(this.parameter);
	},

	update(val)
	{
		this.element.setAttribute('aria-level', val);
	}
});

directive('role', {
	connect()
	{
		if (!this.element.hasAttribute('role'))
			this.element.setAttribute('role', this.parameter);
	}
});

})(this.cxl);
(cxl => {
"use strict";
const
	rx = cxl.rx,
	EventListener = cxl.EventListener,
	directive = cxl.directive,
	component = cxl.component,
	dragManager = {
		dragging: new Set(),
		subject: new rx.Subject(),

		get isDragging()
		{
			return this.dragging.size > 0;
		},

		drag(directive, ev)
		{
			this.subject.next({
				type: 'drag', target: directive.element, directive: directive,
				x: directive.x, y: directive.y, clientX: ev.clientX, clientY: ev.clientY
			});
		},

		dragStart(directive)
		{
			const element = directive.element;

			if (!this.dragging.has(element))
			{
				this.dragging.add(element);
				this.subject.next({ type: 'start', target: element, directive: directive });
			}
		},

		dragEnd(directive)
		{
			const element = directive.element;

			if (this.dragging.has(element))
			{
				this.dragging.delete(element);
				this.subject.next({ type: 'end', target: element, directive: directive });
			}
		}
	}
;

class DragBase extends cxl.Directive
{
	connect()
	{
		this.element.$$drag = this;
		this.bindings = [
			new EventListener(this.element, 'mousedown', this.onMouseDown.bind(this)),
			new EventListener(window, 'mouseup', this.onMouseUp.bind(this)),
			new EventListener(this.element, 'touchstart', this.onMouseDown.bind(this)),
			new EventListener(window, 'touchend', this.onMouseUp.bind(this))
		];
	}

	$getEvent(ev)
	{
		if (ev.touches)
		{
			for (let touch of ev.changedTouches)
				if (touch.identifier===this.touchId)
					return touch;
		} else
			return ev;
	}

	$getTouchId(ev)
	{
		for (let touch of ev.changedTouches)
			if (touch.target === ev.target)
				return touch.identifier;
	}

	cancel(touch)
	{
		this.onEnd(touch);
		this.touchId = null;
		this.capture = false;

		const style = this.element.style;
		style.userSelect = this.$userSelect;
		style.transition = this.$transition;
	}

	onMouseUp(ev)
	{
		if (this.capture)
		{
			const touch = this.$getEvent(ev);

			if (touch)
				this.cancel(touch);

			this.moveBindings[0].destroy();
			this.moveBindings[1].destroy();
		}
	}

	onMouseDown(ev)
	{
		if (ev.touches)
		{
			this.touchId = this.$getTouchId(ev);
			ev.preventDefault();
		}

		const style = this.element.style;

		this.$userSelect = style.userSelect;
		this.$transition = style.transition;
		style.userSelect = style.transition = 'none';

		this.capture = ev.currentTarget;
		this.moveBindings = [
			new EventListener(window, 'mousemove', this.onMove.bind(this)),
			new EventListener(window, 'touchmove', this.onMove.bind(this))
		];
		this.onStart(this.$getEvent(ev));
	}

	onMove(ev)
	{
		if (this.capture)
		{
			const touch = this.$getEvent(ev);

			if (touch)
				this.onDrag(touch);
		}
	}

}

class DragEvents extends DragBase {

	$event(type)
	{
		this.set({ type: type, target: this.element, x: this.x, y: this.y });
	}

	onDrag()
	{
		this.$event('drag');
	}

	onStart()
	{
		this.$event('start');
	}

	onEnd()
	{
		this.$event('end');
	}

}

class DragMove extends DragBase {

	onEnd()
	{
		this.reset();
		dragManager.dragEnd(this);
	}

	reset()
	{
		this.element.style.transform = ``;
	}

	initializeDimensions(el, ev)
	{
		this.width = el.offsetWidth;
		this.height = el.offsetHeight;
		this.offsetY = ev.clientY;
		this.offsetX = ev.clientX;
	}

	onStart(ev)
	{
		const el = this.element;
		this.initializeDimensions(el, ev);
		dragManager.dragStart(this);
	}

	calculateDrag(ev)
	{
		this.x = (ev.clientX-this.offsetX) / this.width;
		this.y = (ev.clientY-this.offsetY) / this.height;
	}

	performDrag(ev, p)
	{
		var transform;

		if (p==='x')
			transform = `translateX(${this.x*100}%)`;
		else if (p==='y')
			transform = `translateY(${this.y*100}%)`;
		else
			transform = `translate(${this.x*100}%, ${this.y*100}%)`;

		this.element.style.transform = transform;
	}

	onDrag(ev)
	{
		this.lastEvent = ev;
		this.calculateDrag(ev);
		this.performDrag(ev, this.parameter);
		dragManager.drag(this, ev);
	}

}

class DragMoveIn extends DragMove {

	initializeDimensions(el)
	{
		const rect = el.getBoundingClientRect();

		this.width = el.offsetWidth;
		this.height = el.offsetHeight;
		this.offsetY = rect.top;
		this.offsetX = rect.left;
	}

	onStart(ev)
	{
		super.onStart(ev);
		this.onDrag(ev);
	}

	reset()
	{
	}

	performDrag(ev, p)
	{
		if (p==='x')
			this.set(this.x);
		else if (p==='y')
			this.set(this.y);
		else
			this.set(this);
	}

}

class DragRegion extends cxl.Directive {

	connect()
	{
		this.elementsIn = new Set();
		this.bindings = [
			dragManager.subject.subscribe(this.onDragEvent.bind(this))
		];
	}

	$event(type, element)
	{
		if (this.subscriber)
			this.set({
				type: type, target: this.element, elementsIn: this.elementsIn,
				droppedElement: element
			});
	}

	onDragEvent(ev)
	{
		if (ev.type==='start')
			this.rect = this.element.getBoundingClientRect();
		else if (ev.type==='end')
		{
			if (this.elementsIn.has(ev.target))
				this.$event('drop', ev.target);

			this.onLeave(ev.target);

		} else if (ev.type==='drag')
			this.onMove(ev);
	}

	isElementIn(ev)
	{
	const
		x = ev.clientX,
		y = ev.clientY,
		rect = this.rect
	;
		return (x > rect.left && x < rect.right && y > rect.top && y < rect.bottom);
	}

	onEnter(el)
	{
		const els = this.elementsIn, size = els.size;

		if (!els.has(el))
		{
			els.add(el);
			this.$event('in');
		}

		if (size===0)
			this.$event('enter');
	}

	onLeave(el)
	{
		const els = this.elementsIn;

		if (els.has(el))
		{
			els.delete(el);
			this.$event('out');

			if (els.size===0)
				this.$event('leave');
		}
	}

	onMove(ev)
	{
		if (!this.rect)
			return;
		const target = ev.target;

		if (this.isElementIn(ev))
			this.onEnter(target);
		else if (this.elementsIn.size)
			this.onLeave(target);
	}

}

class Draggable extends DragMove {

	onStart(ev)
	{
		super.onStart(ev);
		this.element.dragging = true;
		cxl.dom.trigger(this.element, 'draggable.start');
	}

	onEnd(ev)
	{
		super.onEnd(ev);
		this.element.dragging = false;
		cxl.dom.trigger(this.element, 'draggable.end');
	}

}

class DraggableRegion extends DragRegion {

	$event(type, element)
	{
		const host = this.element;

		super.$event(type, element);
		cxl.dom.trigger(host, 'draggable.' + type);

		if (type==='leave' || type==='enter')
			host.over = type==='enter';

		host['in-count'] = this.elementsIn.size;
	}

}

class DraggableSlot extends DraggableRegion {

	$event(type, el)
	{
		if (type==='drop')
		{
			const host = this.element, parent = el.parentElement;

			if (cxl.dom.isEmpty(host))
				host.appendChild(el);
			else if (host.swap && parent.swap)
			{
				const dest = host.childNodes[0];

				// Cancel drag if element is swapped
				// TODO move this somewhere else?
				if (dest.$$drag)
					dest.$$drag.cancel();

				parent.appendChild(dest);
				host.appendChild(el);
			}
		}

		super.$event(type, el);
	}

}

directive('drag.in', DragMoveIn);
directive('drag.region', DragRegion);
directive('drag.events', DragEvents);
directive('drag', DragMove);

directive('draggable.region', DraggableRegion);
directive('draggable.slot', DraggableSlot);
directive('draggable', Draggable);

component({
	name: 'cxl-drag-region',
	events: [ 'draggable.in', 'draggable.out', 'draggable.leave', 'draggable.enter', 'draggable.drop' ],
	attributes: [ 'over', 'in-count' ],
	bindings: 'draggable.region'
}, {
	'in-count': 0,
	over: false
});

component({
	name: 'cxl-drag-slot',
	events: [ 'draggable.in', 'draggable.out', 'draggable.leave', 'draggable.enter', 'draggable.drop' ],
	attributes: [ 'over', 'in-count', 'swap' ],
	bindings: 'draggable.slot'
}, {
	'in-count': 0,
	over: false
});

component({
	name: 'cxl-drag',
	attributes: [ 'dragging' ],
	events: [ 'draggable.start', 'draggable.end' ],
	bindings: 'draggable'
});

})(this.cxl);
(cxl => {
	'use strict';

	const Undefined = cxl.Undefined,
		component = cxl.component,
		behavior = cxl.behavior,
		directive = cxl.directive,
		ui = (cxl.ui = {
			icons: {}
		}),
		FocusCSS = {
			$active: { state: 'active' },
			$hover: { state: 'hover' },
			$focus: { state: 'focus' }
		},
		FocusCircleCSS = {
			$focus: { outline: 0 },
			focusCircle: {
				position: 'absolute',
				width: 48,
				height: 48,
				backgroundColor: '#ccc',
				borderRadius: 24,
				opacity: 0,
				scaleX: 0,
				scaleY: 0,
				display: 'inline-block',
				translateX: -14,
				translateY: -14
			},
			focusCirclePrimary: { backgroundColor: 'primary' },
			focusCircle$invalid$touched: { backgroundColor: 'error' },
			focusCircle$hover: {
				scaleX: 1,
				scaleY: 1,
				translateX: -14,
				translateY: -14,
				opacity: 0.14
			},
			focusCircle$focus: {
				scaleX: 1,
				scaleY: 1,
				translateX: -14,
				translateY: -14,
				opacity: 0.25
			},
			focusCircle$disabled: { scaleX: 0, scaleY: 0 }
		},
		DisabledCSS = {
			$disabled: {
				state: 'disabled'
			},
			$active$disabled: { state: 'disabled' },
			$hover$disabled: { state: 'disabled' }
		};
	function prefix(prefix, css) {
		var result = {},
			i;

		for (i in css) result[prefix + i] = css[i];

		return result;
	}

	behavior('ripple', {
		bindings:
			'@disabled:=disabled on(mousedown):=event keypress:#onKey =event:#ripple',

		ripple(ev, el) {
			if (!this.disabled && ev) {
				ui.ripple(el, ev);
				this.$behavior.next(ev);
			}
		},

		onKey(ev) {
			if (ev.key === 'Enter' || ev.key === ' ') {
				this.event = ev;
				ev.preventDefault();
			}
		}
	});

	behavior('navigation.grid', {
		bindings: 'keypress:#onKey:event.prevent',
		onKey(ev, el) {
			const focused = el.querySelector(':focus'),
				children = new cxl.ElementChildren(el);
			if (!focused) return;

			var cols = el.columns,
				next = focused;

			switch (ev.key) {
				case 'ArrowUp':
					while (cols--) next = children.previousTo(next);
					break;
				case 'ArrowDown':
					while (cols--) next = children.nextTo(next);
					break;
				case 'ArrowLeft':
					next = children.previousTo(next);
					break;
				case 'ArrowRight':
					next = children.nextTo(next);
					break;
				default:
					return cxl.Skip;
			}

			if (next) this.$behavior.next(next);
		}
	});

	behavior('navigation.select', {
		bindings: 'keypress:#onKey:event.prevent',
		onKey(ev, host) {
			let el = this.$behavior.value,
				key = ev.key;
			const children = new cxl.ElementChildren(host);

			switch (key) {
				case 'ArrowDown':
					el = el ? children.nextTo(el) || el : children.first;
					break;
				case 'ArrowUp':
					el = el ? children.previousTo(el) || el : children.last;
					break;
				default:
					key = key.toLowerCase();

					function findByFirst(item) {
						return (
							item.innerText &&
							item.innerText.charAt(0).toLowerCase() === key
						);
					}
					// TODO ?
					if (/^[a-z]$/.test(key))
						el =
							(el && cxl.dom.findNext(el, findByFirst)) ||
							cxl.dom.find(host, findByFirst) ||
							this.selected;
					else return cxl.Skip;
			}

			this.$behavior.next(el);
		}
	});

	behavior('navigation.list', {
		bindings: 'keypress:#onKey:event.prevent',

		onKey(ev, host) {
			const children = new cxl.ElementChildren(host),
				key = ev.key;
			let el =
					this.$behavior.value !== cxl.Undefined &&
					this.$behavior.value,
				newEl = el;
			switch (key) {
				case 'ArrowDown':
					newEl = (newEl && children.nextTo(newEl)) || children.first;

					while (newEl && (newEl.disabled || !newEl.clientHeight)) {
						newEl = newEl && children.nextTo(newEl);
					}

					newEl = newEl || el;

					break;
				case 'ArrowUp':
					newEl =
						(newEl && children.previousTo(newEl)) || children.last;

					while (newEl && (newEl.disabled || !newEl.clientHeight)) {
						newEl = newEl && children.previousTo(newEl);
					}

					newEl = newEl || el;
					break;
				default:
					return cxl.Skip;
			}

			if (newEl) this.$behavior.set(newEl);
		}
	});

	behavior(
		'touchable',
		`
	on(blur):bool:@touched
	@touched:host.trigger(focusable.touched)
`
	);
	behavior(
		'focusable',
		`
		@disabled:aria.prop(disabled):not:focus.enable
		focusable.events`
	);

	behavior('focusable.events', {
		bindings: `
	on(focus):#update:host.trigger(focusable.focus)
	on(blur):#update:host.trigger(focusable.blur)
		`,
		update(ev) {
			const host = this.$behavior.owner.host;

			host.focused = !host.disabled && ev.type === 'focus';
		}
	});

	behavior(
		'selectable',
		`
	registable(selectable)
	action:host.trigger(selectable.action)
	@selected:aria.prop(selected)
`
	);
	behavior('selectable.host', {
		bindings: `
id(host)
registable.host(selectable):=options
=event:#onChange
=options:#onChange
on(change):#onChangeEvent
on(selectable.action):#onAction
@value:=value:#onChange
=selected:#onSelected
	`,

		selected: null,

		/**
		 * Event to handle change event for cxl-option.
		 * TODO Needs to be removed.
		 */
		onChangeEvent(ev) {
			if (ev.target !== this.host) {
				this.event = ev;
				ev.stopImmediatePropagation();
				ev.stopPropagation();
			}
		},

		onChange() {
			if (this.selected && this.selected.value === this.value) return;

			this.setSelected(
				(this.options &&
					this.options.find(o => o.value === this.value)) ||
					null
			);
		},

		onAction(ev) {
			if (this.options.indexOf(ev.target) !== -1) {
				this.setSelected(ev.target);
				ev.stopImmediatePropagation();
				ev.stopPropagation();
			}
		},

		setSelected(el) {
			this.selected = el;
		},

		onSelected() {
			this.$behavior.next(this.selected);
		}
	});

	directive('registable', {
		connect() {
			cxl.dom.trigger(
				this.owner.host,
				(this.parameter || 'registable') + '.register'
			);
		},

		disconnect() {
			cxl.dom.trigger(
				this.owner.host,
				(this.parameter || 'registable') + '.unregister'
			);
		}
	});

	directive('registable.host', {
		initialize() {
			this.value = [];
		},

		connect() {
			const prefix = this.parameter || 'registable';
			this.bindings = [
				new cxl.EventListener(
					this.element,
					prefix + '.register',
					this.register.bind(this)
				),
				new cxl.EventListener(
					this.element,
					prefix + '.unregister',
					this.unregister.bind(this)
				)
			];
		},

		register(ev) {
			const el = ev.target;
			if (this.value.indexOf(el) === -1) this.value.push(el);

			this.set(this.value);
		},

		unregister(ev) {
			const i = this.value.indexOf(ev.target);

			if (i !== -1) this.value.splice(i, 1);

			this.set(this.value);
		}
	});

	component({
		name: 'cxl-appbar',
		attributes: ['extended', 'center'],
		bindings: 'role(heading) aria.level(1)',
		template: `
<div &=".flex content anchor(cxl-appbar-actions)"></div>
<div &=".tabs content(cxl-tabs) anchor(cxl-appbar-tabs)"></div>
	`,
		styles: {
			flex: {
				display: 'flex',
				alignItems: 'center',
				height: 56,
				paddingLeft: 16,
				paddingRight: 16,
				paddingTop: 4,
				paddingBottom: 4
			},
			$: {
				backgroundColor: 'primary',
				flexShrink: 0,
				fontSize: 18,
				color: 'onPrimary',
				elevation: 2
			},
			$fixed: { position: 'fixed', top: 0, right: 0, left: 0 },
			flex$extended: {
				alignItems: 'start',
				height: 128,
				paddingBottom: 24
			},
			flex$medium: { paddingTop: 8, paddingBottom: 8 },

			flex$extended$medium: { paddingLeft: 64, paddingRight: 64 },
			flex$xlarge$center: {
				width: 1200,
				marginLeft: 'auto',
				marginRight: 'auto',
				paddingRight: 0,
				paddingLeft: 0
			},
			tabs$xlarge$center: {
				width: 1200,
				marginLeft: 'auto',
				marginRight: 'auto'
			}
		}
	});

	component({
		name: 'cxl-appbar-title',
		attributes: ['extended'],
		styles: {
			$: { flexGrow: 1, font: 'title' },
			$extended: { font: 'h5', alignSelf: 'flex-end' }
		}
	});

	component(
		{
			name: 'cxl-avatar',
			attributes: ['big', 'src', 'text', 'little', 'alt'],
			bindings: 'role(img) =alt:aria.prop(label)"',
			template: `<img &=".image =src:show:attribute(src) =alt:attribute(alt)" /><div &="=text:show:text =src:hide"></div><cxl-icon icon="user" &=".image"></cxl-icon>`,
			styles: {
				$: {
					borderRadius: 32,
					backgroundColor: 'surface',
					width: 40,
					height: 40,
					display: 'inline-block',
					fontSize: 18,
					lineHeight: 38,
					textAlign: 'center',
					overflowY: 'hidden'
				},
				$little: {
					width: 32,
					height: 32,
					font: 'default',
					lineHeight: 30
				},
				$big: { width: 64, height: 64, font: 'h4', lineHeight: 62 },
				image: { width: '100%', height: '100%', borderRadius: 32 }
			}
		},
		{
			alt: 'Avatar'
		}
	);

	component({
		name: 'cxl-backdrop',
		styles: {
			$: {
				position: 'absolute',
				top: 0,
				left: 0,
				bottom: 0,
				width: '100%',
				backgroundColor: 'rgba(0,0,0,0.32)',
				elevation: 5
			}
		}
	});

	component({
		name: 'cxl-badge',
		attributes: ['secondary', 'error', 'over', 'top'],
		styles: {
			$: {
				display: 'inline-block',
				position: 'relative',
				width: 22,
				height: 22,
				lineHeight: 22,
				font: 'caption',
				borderRadius: '50%',
				color: 'onPrimary',
				backgroundColor: 'primary'
			},
			$secondary: {
				color: 'onSecondary',
				backgroundColor: 'secondary'
			},
			$error: {
				color: 'onError',
				backgroundColor: 'error'
			},
			$top: {
				translateY: -11
			},
			$over: {
				marginLeft: -8
			}
		}
	});

	component({
		name: 'cxl-button',
		attributes: [
			'disabled',
			'primary',
			'flat',
			'secondary',
			'touched',
			'big'
		],
		bindings: 'focusable ripple role(button)',
		styles: [
			FocusCSS,
			{
				$: {
					elevation: 1,
					paddingTop: 8,
					paddingBottom: 8,
					paddingRight: 16,
					paddingLeft: 16,
					cursor: 'pointer',
					display: 'inline-block',
					position: 'relative',
					font: 'button',
					borderRadius: 2,
					userSelect: 'none',
					backgroundColor: 'surface',
					color: 'onSurface',
					textAlign: 'center',
					height: 36
				},

				$big: { padding: 16, font: 'h5', height: 52 },
				$flat: {
					backgroundColor: 'inherit',
					elevation: 0,
					fontWeight: 500,
					paddingRight: 8,
					paddingLeft: 8,
					color: 'inherit'
				},
				$flat$large: { paddingLeft: 12, paddingRight: 12 },

				$primary: {
					backgroundColor: 'primary',
					color: 'onPrimary'
				},
				$secondary: {
					backgroundColor: 'secondary',
					color: 'onSecondary'
				},
				$round: { borderRadius: '50%' },

				$active: { elevation: 3 },
				$active$disabled: { elevation: 1 },
				$active$flat$disabled: { elevation: 0 }
			},
			DisabledCSS
		]
	});

	component({
		name: 'cxl-c',
		styles: (r => {
			for (let i = 12; i > 0; i--)
				r[5]['$xl' + i + '$xlarge'] = r[4]['$lg' + i + '$large'] = r[3][
					'$md' + i + '$medium'
				] = r[2]['$sm' + i + '$small'] = r[1]['$xs' + i] = {
					display: 'block',
					gridColumnEnd: 'span ' + i
				};
			return r;
		})([
			{
				$: { gridColumnEnd: 'span 12', flexShrink: 0 },
				$grow: { flexGrow: 1, flexShrink: 1 },
				$small: { gridColumnEnd: 'auto' },
				$fill: {
					position: 'absolute',
					top: 0,
					left: 0,
					right: 0,
					bottom: 0
				},
				$xl0$xlarge: { display: 'none' },
				$lg0$large: { display: 'none' },
				$md0$medium: { display: 'none' },
				$sm0$small: { display: 'none' },
				$xs0: { display: 'none' },
				// Padding
				$pad16: { padding: 16 },
				$pad8: { padding: 8 },
				$pad24: { padding: 24 },
				// Colors
				$surface: { backgroundColor: 'surface', color: 'onSurface' },
				$error: { backgroundColor: 'error', color: 'onError' },
				$primary: { backgroundColor: 'primary', color: 'onPrimary' },
				$primaryLight: {
					backgroundColor: 'primaryLight',
					color: 'onPrimaryLight'
				},
				$secondary: {
					backgroundColor: 'secondary',
					color: 'onSecondary'
				}
			},
			{},
			{},
			{},
			{},
			{},
			{
				$flex: { display: 'flex' },
				$vflex: { display: 'flex', flexDirection: 'column' }
			}
		])
	});

	component({
		name: 'cxl-card',
		styles: {
			$: {
				elevation: 1,
				borderRadius: 2,
				backgroundColor: 'surface',
				color: 'onSurface'
			},
			$pad8: { padding: 8 },
			$pad16: { padding: 16 }
		}
	});

	component(
		{
			name: 'cxl-chip',
			attributes: [
				'removable',
				'disabled',
				'touched',
				'primary',
				'secondary',
				'little'
			],
			events: ['cxl-chip.remove'],
			bindings: 'focusable keypress:#onKey',
			template: `
<span &=".avatar content(cxl-avatar)"></span><span &=".content content"></span><cxl-icon &=".remove =removable:show on(click):host.trigger(cxl-chip.remove)" icon="times"></cxl-icon>
	`,
			styles: [
				{
					$: {
						borderRadius: 16,
						font: 'subtitle2',
						backgroundColor: 'onSurface12',
						display: 'inline-flex',
						color: 'onSurface',
						lineHeight: 32,
						height: 32,
						verticalAlign: 'top'
					},
					$primary: {
						color: 'onPrimary',
						backgroundColor: 'primary'
					},
					$secondary: {
						color: 'onSecondary',
						backgroundColor: 'secondary'
					},
					$little: { font: 'caption', lineHeight: 20, height: 20 },
					content: {
						display: 'inline-block',
						marginLeft: 12,
						paddingRight: 12
					},
					avatar: { display: 'inline-block' },
					remove: {
						display: 'inline-block',
						marginRight: 12,
						cursor: 'pointer'
					}
				},
				FocusCSS,
				DisabledCSS
			]
		},
		{
			onKey(ev, el) {
				if (
					this.removable &&
					(ev.key === 'Delete' || ev.key === 'Backspace')
				)
					cxl.dom.trigger(el, 'cxl-chip.remove');
			}
		}
	);

	component({
		name: 'cxl-content',
		attributes: ['center'],
		template: `
<div &=".content content"></div>
	`,
		styles: {
			$: {
				padding: 16,
				position: 'relative',
				flexGrow: 1,
				overflowY: 'auto',
				overflowScrolling: 'touch'
			},
			$medium: { padding: 32 },
			$large: { padding: 64 },
			content$xlarge: { width: 1200 },
			content$xlarge$center: {
				padding: 0,
				marginLeft: 'auto',
				marginRight: 'auto'
			}
		}
	});

	component({
		name: 'cxl-dialog',
		template:
			'<cxl-backdrop><div &=".content content"></div></cxl-backdrop>',
		bindings: 'role(dialog)',
		styles: {
			content: {
				backgroundColor: 'surface',
				position: 'absolute',
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				color: 'onSurface'
			},
			content$small: {
				elevation: 12,
				translateY: '-50%',
				top: '50%',
				bottom: 'auto',
				width: '80%',
				marginLeft: 'auto',
				marginRight: 'auto'
			}
		}
	});

	component(
		{
			name: 'cxl-dialog-alert',
			attributes: ['title-text', 'message', 'promise'],
			bindings:
				'role(alertdialog) =modal:aria.prop(modal) =title-text:aria.prop(label)',
			template: `
<cxl-dialog>
	<div &=".content">
		<cxl-t h5 &="=title-text:show:text .title"></cxl-t>
		<div &="=message:text"></div>
	</div>
	<div &=".footer">
		<cxl-button flat &="=action:text action:#remove:#resolve"></cxl-button>
	</div>
</cxl-dialog>
	`,
			styles: {
				content: { padding: 16 },
				footer: { padding: 8 }
			},
			initialize(state) {
				state.$component = this;
				state.promise = new Promise(function(resolve, reject) {
					state.resolve = resolve;
					state.reject = reject;
				});
			}
		},
		{
			action: 'Ok',
			modal: true,
			remove() {
				this.$component.remove();
			}
		}
	);

	component(
		{
			name: 'cxl-dialog-confirm',
			attributes: ['cancel-text'],
			template: `
<cxl-dialog>
	<div &=".content">
		<cxl-t h5 &="=title-text:show:text =title-text:aria.prop(label)"></cxl-t>
		<div &="=message:text"></div>
	</div>
	<div &=".footer">
		<cxl-button flat &="=cancel-text:text action:#remove:#reject"></cxl-button>
		<cxl-button flat &="=action:text action:#remove:#resolve"></cxl-button>
	</div>
</cxl-dialog>
	`,
			extend: 'cxl-dialog-alert'
		},
		{
			'cancel-text': 'Cancel',
			action: 'Confirm'
		}
	);

	component({
		name: 'cxl-drawer',
		events: ['backdrop.click'],
		template: `
<cxl-backdrop &=".backdrop on(click):host.trigger(backdrop.click)"></cxl-backdrop>
<div &="on(click):event.stop .drawer content"></div>
	`,
		attributes: ['visible', 'right', 'permanent'],
		styles: {
			drawer: {
				backgroundColor: 'surface',
				position: 'absolute',
				top: 0,
				left: 0,
				width: '85%',
				bottom: 0,
				opacity: 0,
				color: 'onSurface',
				overflowY: 'auto',
				elevation: 5,
				translateX: '-105%'
			},
			drawer$right$permanent$xlarge: { translateX: '-100%', width: 320 },
			drawer$right: { left: '100%', width: 0, translateX: 0 },
			drawer$right$visible: { translateX: '-100%', width: 320 },

			drawer$small: { width: 288 },
			drawer$large$permanent: { translateX: 0, opacity: 1 },
			drawer$visible: { translateX: 0, opacity: 1 },

			backdrop: {
				width: 0,
				opacity: 0,
				position: 'fixed'
			},
			backdrop$visible: { width: '100%', opacity: 1 },
			backdrop$visible$permanent$large: { width: 0 },
			backdrop$visible$right$large: { width: '100%' },
			backdrop$visible$permanent$right$xlarge: { width: 0 }
		}
	});

	component({
		name: 'cxl-fab',
		attributes: ['disabled', 'touched', 'static'],
		bindings: 'focusable',
		styles: [
			{
				$: {
					elevation: 2,
					backgroundColor: 'secondary',
					color: 'onSecondary',
					position: 'fixed',
					width: 56,
					height: 56,
					bottom: 16,
					right: 24,
					borderRadius: 56,
					textAlign: 'center',
					paddingTop: 20,
					cursor: 'pointer',
					font: 'h6',
					paddingBottom: 20,
					lineHeight: 16
				},
				$static: { position: 'static' },
				$focus: { elevation: 4 },
				$small: { top: 28, bottom: '' }
			},
			FocusCSS,
			DisabledCSS
		]
	});

	component(
		{
			name: 'cxl-grid',
			attributes: ['rows', 'columns', 'gap'],
			bindings: `
=rows:style.inline(gridTemplateRows)
=columns:#setColumns
=gap:style.inline(gridGap)
	`,
			styles: {
				$: { display: 'grid' },
				$pad16: { padding: 16 },
				$pad8: { padding: 8 },
				$pad24: { padding: 24 }
			}
		},
		{
			// TODO
			columns: 'repeat(12, 1fr)',
			gap: '16px 16px',
			setColumns(val, el) {
				el.style.gridTemplateColumns = val;
			}
		}
	);

	component({
		name: 'cxl-hr',
		bindings: 'role(separator)',
		styles: {
			$: {
				border: 0,
				borderBottom: 1,
				borderColor: 'divider',
				borderStyle: 'solid'
			}
		}
	});

	component(
		{
			name: 'cxl-icon',
			bindings: 'role(img) =icon:#setIcon',
			attributes: ['icon'],
			styles: {
				$: {
					display: 'inline-block',
					fontFamily: 'Font Awesome\\ 5 Free',
					fontSize: 'inherit'
				},
				$round: {
					borderRadius: '50%',
					width: '1.375em',
					height: '1.375em',
					lineHeight: '1.375em',
					textAlign: 'center'
				},
				$outline: { borderWidth: 1, borderStyle: 'solid' }
			}
		},
		{
			setIcon(val, el) {
				const icon = ui.icons[this.icon];

				if (icon) {
					if (this.iconNode) {
						this.iconNode.data = icon;
					} else {
						this.iconNode = document.createTextNode(icon);
						el.appendChild(this.iconNode);
					}

					if (!el.hasAttribute('aria-label'))
						cxl.dom.setAttribute(el, 'aria-label', this.icon);
				}
			}
		}
	);

	component(
		{
			name: 'cxl-list',
			styles: {
				$: {
					paddingTop: 8,
					paddingBottom: 8,
					marginLeft: -16,
					marginRight: -16
				}
			}
		},
		{
			onNav(el) {
				if (el) el.focus();
			}
		}
	);

	component({
		name: 'cxl-item',
		template: `
<a &=".link =href:attribute(href)" tabindex="-1">
	<cxl-icon role="presentation" &="=icon:show:@icon .icon"></cxl-icon>
	<div &=".content content"></div>
</a>
	`,
		bindings: `
focusable ripple role(listitem)
	`,
		attributes: ['href', 'icon', 'selected', 'disabled', 'touched'],
		styles: [
			prefix('link', FocusCSS),
			{
				$: { cursor: 'pointer', position: 'relative' },
				$disabled: { pointerEvents: 'none' },
				'link:focus': { outline: 0 },
				link: {
					color: 'onSurface',
					lineHeight: 24,
					paddingRight: 16,
					paddingLeft: 16,
					paddingTop: 12,
					font: 'default',
					paddingBottom: 12,
					alignItems: 'center',
					backgroundColor: 'surface',
					textDecoration: 'none',
					display: 'flex'
				},
				content: { flexGrow: 1 },
				icon: {
					marginRight: 16,
					width: 28,
					color: 'onSurface',
					opacity: 0.7
				},
				icon$selected: { color: 'onPrimaryLight' },
				link$selected: {
					backgroundColor: 'primaryLight',
					color: 'onPrimaryLight'
				}
			},
			prefix('link', DisabledCSS)
		]
	});

	component(
		{
			name: 'cxl-menu',
			styles: {
				$: {
					elevation: 1,
					display: 'inline-block',
					backgroundColor: 'surface',
					overflowY: 'auto',
					color: 'onSurface',
					paddingTop: 8,
					paddingBottom: 8
				},
				$dense: { paddingTop: 0, paddingBottom: 0 },
				$closed: { scaleY: 0 }
			},
			attributes: ['closed', 'dense'],
			methods: ['focus'],
			bindings:
				'=tabIndex:@tabIndex id(self) role(list) navigation.list:#onNav'
		},
		{
			tabIndex: -1,
			itemSelector: 'cxl-item:not([disabled])',

			focus() {
				const item = cxl.dom.find(this.self, this.itemSelector);

				if (item) item.focus();
			},

			onNav(el) {
				el.focus();
			}
		}
	);

	component({
		name: 'cxl-meta',
		initialize() {
			function meta(name, content) {
				document.head.appendChild(
					cxl.dom('meta', { name: name, content: content })
				);
			}
			document.documentElement.lang = 'en-US';

			meta('viewport', 'width=device-width, initial-scale=1');
			meta('apple-mobile-web-app-capable', 'yes');
			meta('mobile-web-app-capable', 'yes');

			const style = document.createElement('STYLE');
			style.innerHTML = 'body,html{padding:0;margin:0;height:100%}';
			document.head.appendChild(style);
			const font = cxl.dom('link', {
				rel: 'stylesheet',
				href:
					'https://fonts.googleapis.com/css?family=Roboto:300,400,500'
			});
			document.head.appendChild(font);
		}
	});

	component(
		{
			name: 'cxl-toggle',
			attributes: ['disabled', 'touched', 'opened'],
			template: `
<div &="content"></div>
<div &="id(popup) =opened:show .popup content(cxl-toggle-popup)"></div>
	`,
			bindings: `
focusable
root.on(click):#close keypress(escape):#close
action:#show:event.stop
role(button)
	`,
			styles: {
				popup: { height: 0, elevation: 5, position: 'absolute' },
				$disabled: { pointerEvents: 'none' }
			}
		},
		{
			opened: false,
			close() {
				this.opened = false;
			},
			show() {
				if (this.disabled) return;

				if (!this.opened) {
					this.opened = true;
					this.popup.style.right = 0; //'calc(100% - ' + (el.offsetLeft + el.offsetWidth) + 'px)';
				} else this.close();
			}
		}
	);

	component({
		name: 'cxl-icon-toggle',
		attributes: ['icon'],
		extend: 'cxl-toggle',
		template: `
<span &="=opened:hide .focusCircle .focusCirclePrimary"></span>
<cxl-icon &="=icon:@icon"></cxl-icon>
<div &="id(popup) =opened:show .popup content(cxl-toggle-popup)"></div>
	`,
		styles: [
			FocusCircleCSS,
			{
				$: {
					paddingTop: 8,
					paddingBottom: 8,
					paddingLeft: 12,
					paddingRight: 12,
					cursor: 'pointer',
					position: 'relative'
				},
				focusCircle: { left: -4 }
			}
		]
	});

	component(
		{
			name: 'cxl-menu-toggle',
			attributes: ['disabled', 'touched', 'icon'],
			template: `
<div &=".menu action:event.stop:not:=showMenu">
<cxl-menu dense closed &="id(menu) .menuControl =showMenu:not:@closed content"></cxl-menu>
</div>
<cxl-icon &=".icon =icon:@icon"></cxl-icon>
	`,
			bindings: `
id(self) focusable root.on(touchend):#close root.on(click):#close keypress(escape):#close action:#show:event.stop role(button)
	`,
			styles: [
				{
					icon: {
						cursor: 'pointer',
						width: 8
					},
					menuControl: {
						position: 'absolute',
						transformOrigin: 'right top',
						textAlign: 'left',
						right: 0
					},
					menu: {
						height: 0,
						textAlign: 'right',
						elevation: 5
					}
				},
				DisabledCSS
			]
		},
		{
			icon: 'ellipsis-v',
			flat: true,
			showMenu: false,
			itemSelector: 'cxl-item:not([disabled])',
			close() {
				this.showMenu = false;
			},
			show(ev, el) {
				this.showMenu = true;
				this.menu.style.right =
					'calc(100% - ' + (el.offsetLeft + el.offsetWidth) + 'px)';

				const item = cxl.dom.find(el, this.itemSelector);

				if (item) item.focus();
			}
		}
	);

	component(
		{
			name: 'cxl-navbar',
			attributes: ['permanent'],
			bindings: 'role(navigation)',
			template: `
<cxl-drawer &="role(list) action:#onRoute =permanent:@permanent =visible:@visible content location:#onRoute"></cxl-drawer>
<cxl-icon alt="Open Navigation Bar" &="action:#toggle .toggler" icon="bars"></cxl-icon>
	`,
			styles: {
				$: {
					display: 'inline-block',
					marginTop: 8,
					marginBottom: 8,
					overflowScrolling: 'touch'
				},
				toggler: {
					width: 16,
					marginRight: 32,
					cursor: 'pointer'
				},
				toggler$permanent$large: { display: 'none' }
			}
		},
		{
			permanent: false,
			visible: false,
			toggle() {
				this.visible = !this.visible;
			},

			onRoute() {
				this.visible = false;
			}
		}
	);

	component(
		{
			name: 'cxl-progress',
			events: ['change'],
			attributes: ['value'],
			bindings: 'role(progressbar)',
			template: `
<div &=".indicator =value:host.trigger(change):#setValue:.indeterminate"></div>
	`,
			styles: {
				$: { backgroundColor: 'primaryLight', height: 4 },
				indicator: {
					backgroundColor: 'primary',
					height: 4,
					transformOrigin: 'left'
				},
				indeterminate: { animation: 'wait' }
			}
		},
		{
			value: null,

			setValue(val, el) {
				if (val !== null) {
					el.style.transform = 'scaleX(' + val + ')';
					return cxl.Skip;
				}

				return true;
			}
		}
	);

	component(
		{
			name: 'cxl-ripple',
			attributes: ['x', 'y', 'radius'],
			bindings: 'id(host) connect:#connect',
			template: `<div &="id(ripple) on(animationend):#end .ripple"></div>`,
			styles: {
				$: {
					position: 'absolute',
					overflowX: 'hidden',
					overflowY: 'hidden',
					top: 0,
					left: 0,
					right: 0,
					bottom: 0,
					pointerEvents: 'none'
				},
				ripple: {
					position: 'relative',
					borderRadius: '100%',
					scaleX: 0,
					scaleY: 0,
					backgroundColor: 'onSurface',
					opacity: 0.16,
					animation: 'expand',
					animationDuration: '0.4s'
				},
				ripple$primary: { backgroundColor: 'primary' },
				ripple$secondary: { backgroundColor: 'secondary' }
			}
		},
		{
			connect() {
				const style = this.ripple.style;
				style.left = this.x - this.radius + 'px';
				style.top = this.y - this.radius + 'px';
				style.width = style.height = this.radius * 2 + 'px';
			},

			end() {
				cxl.dom.remove(this.host);
			}
		}
	);

	component({
		name: 'cxl-ripple-container',
		attributes: ['disabled'],
		styles: {
			$: {
				position: 'relative',
				overflowX: 'hidden',
				overflowY: 'hidden'
			}
		},
		bindings: 'ripple'
	});

	component(
		{
			name: 'cxl-snackbar',
			attributes: ['delay'],
			styles: {
				$: {
					display: 'block',
					opacity: 0,
					scaleX: 0.5,
					scaleY: 0.5,
					padding: 16,
					elevation: 3,
					backgroundColor: '#333',
					color: '#eee',
					marginBottom: 16
				},

				$small: { display: 'inline-block' }
			},
			bindings: 'connect:#connect'
		},
		{
			connect(val, host) {
				// TODO better way to animate?
				setTimeout(() => {
					host.style.opacity = 1;
					host.style.transform = 'scale(1,1)';
				}, 50);
			},

			delay: 4000
		}
	);

	component(
		{
			name: 'cxl-snackbar-container',
			bindings: 'connect:#connect',

			styles: {
				$: {
					position: 'fixed',
					left: 16,
					bottom: 16,
					right: 16,
					textAlign: 'center'
				},
				$left: { textAlign: 'left' },
				$right: { textAlign: 'right' }
			},

			initialize(state) {
				state.host = this;
				state.queue = [];
			},

			methods: ['notify']
		},
		{
			queue: null,

			connect(val, host) {
				ui.snackbarContainer = host;
			},

			notifyNext() {
				const next = this.queue[0];

				cxl.dom.insert(this.host, next);

				setTimeout(() => {
					cxl.dom.remove(next);

					this.queue.shift();

					if (this.queue.length) this.notifyNext();
				}, next.delay);
			},

			notify(snackbar) {
				this.queue.push(snackbar);

				if (this.queue.length === 1) this.notifyNext();
			}
		}
	);

	cxl.css.animation.spinnerstroke = {
		keyframes: `
0%      { stroke-dashoffset: $start;  transform: rotate(0); }
12.5%   { stroke-dashoffset: $end;    transform: rotate(0); }
12.5001%  { stroke-dashoffset: $end;    transform: rotateX(180deg) rotate(72.5deg); }
25%     { stroke-dashoffset: $start;  transform: rotateX(180deg) rotate(72.5deg); }
25.0001%   { stroke-dashoffset: $start;  transform: rotate(270deg); }
37.5%   { stroke-dashoffset: $end;    transform: rotate(270deg); }
37.5001%  { stroke-dashoffset: $end;    transform: rotateX(180deg) rotate(161.5deg); }
50%     { stroke-dashoffset: $start;  transform: rotateX(180deg) rotate(161.5deg); }
50.0001%  { stroke-dashoffset: $start;  transform: rotate(180deg); }
62.5%   { stroke-dashoffset: $end;    transform: rotate(180deg); }
62.5001%  { stroke-dashoffset: $end;    transform: rotateX(180deg) rotate(251.5deg); }
75%     { stroke-dashoffset: $start;  transform: rotateX(180deg) rotate(251.5deg); }
75.0001%  { stroke-dashoffset: $start;  transform: rotate(90deg); }
87.5%   { stroke-dashoffset: $end;    transform: rotate(90deg); }
87.5001%  { stroke-dashoffset: $end;    transform: rotateX(180deg) rotate(341.5deg); }
100%    { stroke-dashoffset: $start;  transform: rotateX(180deg) rotate(341.5deg); }
		`
			.replace(/\$start/g, 282.743 * (1 - 0.05))
			.replace(/\$end/g, 282.743 * (1 - 0.8)),
		value: 'cxl-spinnerstroke 4s infinite cubic-bezier(.35,0,.25,1)'
	};

	component({
		name: 'cxl-spinner',
		template: `<svg viewBox="0 0 100 100" style="width:100px;height:100px">
<circle cx="50%" cy="50%" r="45" style="stroke:var(--cxl-primary);fill:transparent;transition:stroke-dashoffset var(--cxl-speed);stroke-width:10%;transform-origin:center;stroke-dasharray:282.743px" &=".circle" /></svg>`,
		styles: {
			$: { animation: 'spin', display: 'inline-block' },
			circle: { animation: 'spinnerstroke' }
		}
	});

	component({
		name: 'cxl-t',
		attributes: ['font'],
		bindings: '=font:gate:attribute',
		styles: {
			$: { font: 'default', marginBottom: 8 },
			$lastChild: { marginBottom: 0 },
			$inline: { display: 'inline' },

			$caption: { font: 'caption' },
			$h1: { font: 'h1', marginBottom: 64 },
			$h2: { font: 'h2', marginBottom: 48 },
			$h3: { font: 'h3', marginBottom: 32 },
			$h4: { font: 'h4', marginBottom: 24 },
			$h5: { font: 'h5', marginBottom: 16 },
			$h6: { font: 'h6', marginBottom: 16 },
			$button: { font: 'button' },
			$subtitle: { font: 'subtitle', marginBottom: 0 },
			$subtitle2: { font: 'subtitle2', opacity: 0.73 }
		}
	});

	component(
		{
			name: 'cxl-tab',
			template: '<a &=".link =href:attribute(href) content"></a>',
			bindings:
				'role(tab) focusable ripple =selected:filter:host.trigger(cxl-tab.selected)',
			attributes: ['href', 'selected', 'disabled', 'touched'],
			styles: [
				{
					$: { flexShrink: 0 },
					$small: { display: 'inline-block' },
					link: {
						padding: 16,
						paddingBottom: 12,
						border: 0,
						backgroundColor: 'primary',
						font: 'button',
						color: 'onPrimary',
						lineHeight: 20,
						textDecoration: 'none',
						textAlign: 'center',
						display: 'block'
					}
				},
				FocusCSS,
				DisabledCSS
			]
		},
		{
			href: null,
			selected: false
		}
	);

	component(
		{
			name: 'cxl-tabs',
			template: `<div &=".content content"></div><div &="id(indicator) .selected"></div>`,
			bindings: `
role(tablist)
on(cxl-tab.selected):#onSelected
=selected:#update
root.on(load):#update
	`,
			attributes: ['selected'],
			styles: {
				$: {
					backgroundColor: 'primary',
					color: 'onPrimary',
					display: 'block',
					flexShrink: 0,
					position: 'relative',
					cursor: 'pointer',
					overflowX: 'auto'
				},
				selected: {
					transformOrigin: 'left',
					backgroundColor: 'secondary',
					height: 4,
					width: 100,
					transform: 'scaleX(0)'
				},
				content: { display: 'flex' },
				content$small: { display: 'block' }
			}
		},
		{
			selected: Undefined,
			update() {
				const bar = this.indicator,
					tab = this.selected;

				if (!tab) return (bar.style.transform = 'scaleX(0)');

				// Add delay so styles finish rendering...
				requestAnimationFrame(() => {
					const scaleX = tab.clientWidth / 100;
					bar.style.transform = `translate(${
						tab.offsetLeft
					}px, 0) scaleX(${scaleX})`;
				});
			},

			onSelected(ev) {
				if (this.selected) this.selected.selected = false;

				this.selected = ev.target;
			}
		}
	);

	Object.assign(ui, {
		alert(options) {
			if (typeof options === 'string') options = { message: options };

			const modal = cxl.dom('cxl-dialog-alert', options);

			document.body.appendChild(modal);

			return modal.promise;
		},

		/**
		 * Confirmation dialog
		 */
		confirm(options) {
			if (typeof options === 'string') options = { message: options };

			var modal = cxl.dom('cxl-dialog-confirm', options);

			document.body.appendChild(modal);

			return modal.promise;
		},

		notify(options) {
			var bar = ui.snackbarContainer;

			if (typeof options === 'string') options = { content: options };

			if (!bar) {
				bar = cxl.dom('cxl-snackbar-container');
				document.body.appendChild(bar);
			}

			const snackbar = cxl.dom('cxl-snackbar', options);

			if (options.content) cxl.dom.insert(snackbar, options.content);

			bar.notify(snackbar);
		},

		ripple(hostEl, ev) {
			const x = ev.x,
				y = ev.y,
				rect = hostEl.getBoundingClientRect(),
				radius = rect.width > rect.height ? rect.width : rect.height,
				ripple = cxl.dom('cxl-ripple', {
					x: x === undefined ? rect.width / 2 : x - rect.left,
					y: y === undefined ? rect.height / 2 : y - rect.top,
					radius: radius
				}),
				// Add to shadow root if present to avoid layout changes
				parent = hostEl.shadowRoot || hostEl;
			parent.appendChild(ripple);
		}
	});
})(this.cxl);

(cxl => {
	'use strict';
	const component = cxl.component;

	component({
		name: 'cxl-table',
		bindings: 'role(table)',
		styles: {
			$: { display: 'block', width: '100%', overflowX: 'auto' },
			$small: { display: 'table' }
		}
	});

	component(
		{
			name: 'cxl-th',
			events: ['datatable.sort'],
			attributes: ['width', 'sortable', 'sortOrder'],
			bindings:
				'role(columnheader) =width:style.inline(width) action:#onAction =sortable:bool:attribute(sort)',
			template: `
	<cxl-icon &="=sortable:.sortable .sortIcon =sortOrder:style:host.trigger(datatable.sort)" icon="arrow-up"></cxl-icon><span &="content"></span>
			`,
			styles: {
				$: {
					display: 'table-cell',
					flexGrow: 1,
					font: 'caption',
					color: 'headerText',
					paddingTop: 12,
					paddingBottom: 12,
					paddingLeft: 8,
					paddingRight: 8,
					borderBottom: '1px solid',
					borderColor: 'divider',
					lineHeight: 24,
					whiteSpace: 'nowrap'
				},
				sortIcon: {
					display: 'none',
					marginLeft: -18,
					marginRight: 8,
					scaleY: 0,
					scaleX: 0
				},
				$sort: { cursor: 'pointer' },
				$sort$hover: { color: 'onSurface' },
				sortIcon$sort: { display: 'inline-block' },
				asc: { rotate: 0, scaleX: 1, scaleY: 1 },
				desc: {
					rotate: '180deg',
					scaleX: 1,
					scaleY: 1
				}
			}
		},
		{
			sortOrder: 'none',

			toggleSort() {
				const sort = this.sortOrder;
				this.sortOrder =
					sort === 'asc' ? 'desc' : sort === 'desc' ? 'none' : 'asc';
			},
			onAction() {
				if (this.sortable) this.toggleSort();
			}
		}
	);

	component({
		name: 'cxl-td',
		bindings: 'role(cell)',
		styles: {
			$: {
				display: 'table-cell',
				paddingTop: 12,
				paddingBottom: 12,
				paddingLeft: 8,
				paddingRight: 8,
				flexGrow: 1,
				borderBottom: '1px solid',
				borderColor: 'divider'
			},
			$firstChild: { paddingLeft: 16 },
			$lastChild: { paddingRight: 16 },
			$primary: { backgroundColor: 'primary', color: 'onPrimary' },
			$secondary: { backgroundColor: 'secondary', color: 'onSecondary' }
		}
	});

	component({
		name: 'cxl-td-checkbox',
		extend: 'cxl-td',
		attributes: ['data', 'checked'],
		bindings:
			'=checked:host.trigger(datatable.select) registable(datatable.checkbox)',
		styles: {
			$: { width: 48 },
			checkbox: { paddingTop: 0, paddingBottom: 0 }
		},
		template: `<cxl-checkbox &=".checkbox =checked::@checked"></cxl-checkbox>`
	});

	component(
		{
			name: 'cxl-th-checkbox',
			extend: 'cxl-td',
			attributes: ['checked'],
			bindings: 'registable(datatable.checkboxAll)',
			styles: {
				$: { width: 48 },
				checkbox: { paddingTop: 0, paddingBottom: 0 }
			},
			template: `<cxl-checkbox &=".checkbox =checked:#onChecked action:delay:#onAction:host.trigger(datatable.selectAll)"></cxl-checkbox>`
		},
		{
			onAction(ev, el) {
				if (this.checked === null && el.checked === false)
					this.checked = false;
				else this.checked = el.checked;
			},
			onChecked(val, el) {
				el.indeterminate = val === null;

				if (val !== null) el.checked = val;
			}
		}
	);

	component(
		{
			name: 'cxl-tr',
			attributes: ['selected'],
			bindings: 'role(row) on(datatable.select):#onSelect',
			styles: {
				$: { display: 'table-row' },
				$selected: { backgroundColor: 'primaryLight' }
			}
		},
		{
			onSelect(ev) {
				this.selected = ev.target.checked;
			}
		}
	);

	component({
		name: 'cxl-table-header',
		styles: {
			$: {
				font: 'h6',
				lineHeight: 36,
				paddingTop: 16,
				paddingBottom: 16,
				paddingLeft: 16,
				paddingRight: 16
			}
		}
	});

	component({
		name: 'cxl-table-selected',
		extend: 'cxl-table-header',
		attributes: ['selected'],
		template: `
		<cxl-c grow><x &="=selected:len:text"></x> selected</cxl-c><div &="content"></div>
		`,
		styles: {
			$: {
				font: 'subtitle',
				lineHeight: 36,
				height: 68,
				backgroundColor: 'primaryLight',
				color: 'onPrimaryLight',
				display: 'flex'
			}
		}
	});

	component(
		{
			name: 'cxl-datatable',
			events: ['change'],
			bindings: `
				registable.host(datatable.checkbox):=selectable:#resetSelect
				registable.host(datatable.checkboxAll):=selectAll
				on(datatable.select):#onSelect
				on(datatable.selectAll):#onSelectAll
				=selected:#updateSelected
				=data:#update on(datatable.sort):#onSort:#update
				=value:host.trigger(change)
			`,
			attributes: ['data', 'rows', 'page', 'value', 'selected'],
			template: `
<div &="=selected:len:hide content(cxl-table-header)"></div>
<div &="=selected:len:show content(cxl-table-selected)"></div>
<cxl-table &="content"></cxl-table>
<cxl-pagination &="=rows:@rows =sortedData:@data @paginatedData:=value"></cxl-pagination>
			`
		},
		{
			selectAll: null,
			value: cxl.Undefined,
			rows: 5,
			page: 0,
			sortedByHeader: null,

			updateSelectAll(selected, selectAll) {
				if (!this.selectable || !selected || selected.size === 0)
					return selectAll.forEach(s => (s.checked = false));

				for (let el of this.selectable)
					if (!el.checked) {
						return selectAll.forEach(s => (s.checked = null));
					}

				selectAll.forEach(s => (s.checked = true));
			},

			updateSelected(selected) {
				if (this.selectable)
					this.selectable.forEach(
						el => (el.checked = selected && selected.has(el.data))
					);

				if (this.selectAll)
					this.updateSelectAll(selected, this.selectAll);
			},

			resetSelect() {
				this.selected = null;
			},

			onSelect(ev) {
				const el = ev.target,
					data = ev.target.data;

				this.selected = new Set(this.selected);
				this.selected[el.checked ? 'add' : 'delete'](data);
			},

			onSelectAll(ev) {
				if (this.selectable) {
					const checked = ev.target.checked;
					this.selectable.forEach(el => (el.checked = checked));
				}
			},

			onSort(ev) {
				const order = ev.detail,
					th = ev.target,
					sortedEl = this.sortedByHeader;
				if (order === 'none') {
					if (sortedEl === th)
						this.sortedByHeader = this.sortFn = null;
					return;
				}

				if (sortedEl && sortedEl !== th)
					this.sortedByHeader.sortOrder = 'none';

				this.sortedByHeader = th;

				this.sortField = th.sortable;
				this.sortFn = order === 'none' ? null : this[order];
			},

			asc(a, b) {
				const field = this.sortField;
				return a[field] > b[field] ? 1 : -1;
			},

			desc(a, b) {
				const field = this.sortField;
				return a[field] > b[field] ? -1 : 1;
			},

			update() {
				const data = this.data,
					sortFn = this.sortFn;
				this.count = data ? data.length : 0;
				this.sortedData = sortFn
					? data.slice(0).sort(sortFn.bind(this))
					: data;
			}
		}
	);

	component(
		{
			name: 'cxl-pagination',
			attributes: ['rows', 'data', 'paginatedData', 'rowsOptions'],
			bindings: `=rows:#updatePage =data:#updatePage`,
			styles: {
				$: {
					paddingLeft: 8,
					paddingRight: 8,
					paddingTop: 4,
					paddingBottom: 4,
					textAlign: 'right'
				},
				rpp: {
					marginRight: 32,
					display: 'inline-block'
				},
				res: {
					display: 'none'
				},
				res$small: { display: 'inline' }
			},
			template: `
<cxl-t inline>Rows <x &=".res">per page:</x>&nbsp;</cxl-t>
<cxl-select inline &="=rows::value .rpp">
	<template &="=rowsOptions:marker.empty:each:repeat">
	<cxl-option &="$value:@value $label:text"></cxl-option>
	</template>
</cxl-select>
<cxl-t inline><span &="=pageStart:text"></span>-<span &="=pageEnd:text"></span> of <span &="=count:text"></span></cxl-t>
<cxl-button &="=disablePrev:@disabled action:#previusPage" flat round aria-label="Go To Previous Page"><cxl-icon icon="arrow-left"></cxl-icon></cxl-button>
<cxl-button &="=disableNext:@disabled action:#nextPage" flat round aria-label="Go To Next Page"><cxl-icon icon="arrow-right"></cxl-icon></cxl-button>
		`
		},
		{
			rows: 5,
			page: 0,
			count: 0,
			rowsOptions: [
				{ label: 5, value: 5 },
				{ label: 10, value: 10 },
				{ label: 25, value: 25 }
			],

			nextPage() {
				this.page += 1;
				this.updatePage();
			},

			previusPage() {
				this.page -= 1;
				this.updatePage();
			},

			updatePage() {
				const data = this.data;

				if (!data || !Array.isArray(data) || !this.rows) {
					this.page = this.count = this.pageStart = this.pageEnd = 0;
				} else {
					const count = (this.count = data.length);
					let pageStart = this.page * (this.rows - 1);

					if (pageStart > count) pageStart = this.page = 0;

					const pageEnd = pageStart + this.rows;

					this.count = data.length;
					this.pageStart = pageStart + 1;
					this.pageEnd = pageEnd > this.count ? this.count : pageEnd;
					this.disablePrev = this.page === 0;
					this.disableNext = this.pageEnd === this.count;

					this.paginatedData = data.slice(pageStart, pageEnd);
				}
			}
		}
	);
})(this.cxl);

(() => {
	const component = cxl.component,
		radioValues = [],
		FocusCircleCSS = {
			$focus: { outline: 0 },
			focusCircle: {
				position: 'absolute',
				width: 48,
				height: 48,
				backgroundColor: '#ccc',
				borderRadius: 24,
				opacity: 0,
				scaleX: 0,
				scaleY: 0,
				display: 'inline-block',
				translateX: -14,
				translateY: -14
			},
			focusCirclePrimary: { backgroundColor: 'primary' },
			focusCircle$invalid$touched: { backgroundColor: 'error' },
			focusCircle$hover: {
				scaleX: 1,
				scaleY: 1,
				translateX: -14,
				translateY: -14,
				opacity: 0.14
			},
			focusCircle$focus: {
				scaleX: 1,
				scaleY: 1,
				translateX: -14,
				translateY: -14,
				opacity: 0.25
			},
			focusCircle$disabled: { scaleX: 0, scaleY: 0 }
		},
		InputBase = (cxl.ui.InputBase = new cxl.ComponentDefinition(
			{
				events: ['change', 'input', 'invalid', 'blur', 'focus'],
				attributes: [
					'value',
					'invalid',
					'disabled',
					'touched',
					'focused',
					'name'
				],
				bindings: `
	registable(form)
	touchable

	=disabled:host.trigger(form.disabled)
	=invalid:aria.prop(invalid):host.trigger(invalid)
	=value:host.trigger(change):host.trigger(input)
		`
			},
			{
				onFocus(ev, el) {
					el.focused = !el.disabled;
				}
			}
		));
	component({
		name: 'cxl-field-toggle',
		attributes: ['icon', 'position'],
		extend: 'cxl-toggle',
		template: `
<span &="=opened:hide .focusCircle .focusCirclePrimary"></span>
<cxl-icon &="=icon:@icon"></cxl-icon>
	`,
		styles: [
			FocusCircleCSS,
			{
				$: {
					paddingTop: 8,
					paddingBottom: 8,
					paddingLeft: 12,
					paddingRight: 12,
					cursor: 'pointer',
					position: 'relative'
				},
				focusCircle: { left: -4 }
			}
		]
	});

	component(
		{
			name: 'cxl-checkbox',
			extend: InputBase,
			template: `
<span &=".focusCircle .focusCirclePrimary"></span>
<cxl-icon &="=indeterminate:#setIcon .box"></cxl-icon>
<span &="content"></span>
	`,
			bindings: `
role(checkbox)
focusable
action:#toggle
=value:#onValue
=checked:#update:aria.prop(checked)
=false-value:#update
=true-value:#update
	`,
			styles: [
				{
					$: {
						marginRight: 16,
						marginLeft: 0,
						position: 'relative',
						cursor: 'pointer',
						paddingTop: 12,
						paddingBottom: 12
					},
					$disabled: { state: 'disabled' },
					$inline: { display: 'inline-block' },
					$invalid$touched: { color: 'error' },
					box: {
						display: 'inline-block',
						width: 20,
						height: 20,
						border: 2,
						borderColor: 'onSurface',
						marginRight: 8,
						lineHeight: 16,
						borderStyle: 'solid',
						color: 'rgba(0,0,0,0)',
						fontSize: 'var(--cxl-fontSize)'
					},
					box$checked: {
						borderColor: 'primary',
						backgroundColor: 'primary',
						color: 'onPrimary'
					},
					box$indeterminate: {
						borderColor: 'primary',
						backgroundColor: 'primary',
						color: 'onPrimary'
					},
					box$invalid$touched: { borderColor: 'error' }
				},
				FocusCircleCSS
			],
			attributes: [
				'checked',
				'true-value',
				'false-value',
				'inline',
				'indeterminate'
			]
		},
		{
			value: cxl.Undefined,
			checked: false,
			indeterminate: false,
			'true-value': true,
			'false-value': false,

			setIcon(val, el) {
				el.icon = val ? 'minus' : 'check';
			},

			onValue(val) {
				this.checked = val === this['true-value'];
			},

			update() {
				this.value = this[this.checked ? 'true-value' : 'false-value'];
			},

			toggle(ev) {
				if (this.disabled) return;

				if (this.indeterminate) {
					this.checked = false;
					this.indeterminate = false;
				} else this.checked = !this.checked;

				ev.preventDefault();
			}
		}
	);

	component({
		name: 'cxl-field-help',
		attributes: ['invalid'],
		styles: {
			$: {
				lineHeight: 12,
				verticalAlign: 'bottom',
				font: 'caption',
				paddingTop: 8
			},
			$invalid: { color: 'error' }
		}
	});

	component({
		name: 'cxl-field-base',
		attributes: [
			'outline',
			'floating',
			'invalid',
			'focused',
			'leading',
			'disabled',
			'hovered'
		],
		template: `
<div &=".mask"><div &=".label content(cxl-label-slot)"></div></div>
<div &=".content content(cxl-field-content)"></div>
<slot &="content"></slot>
	`,
		styles: {
			$: {
				position: 'relative',
				paddingLeft: 12,
				paddingRight: 12,
				paddingTop: 28,
				paddingBottom: 6,
				backgroundColor: 'surface',
				color: 'onSurface'
			},
			$focused: { borderColor: 'primary', color: 'primary' },
			$outline: {
				borderColor: 'onSurface',
				borderWidth: 1,
				borderStyle: 'solid',
				borderRadius: 4,
				marginTop: 2,
				paddingTop: 14,
				paddingBottom: 14
			},
			$focused$outline: {
				boxShadow: '0 0 0 1px var(--cxl-primary)',
				borderColor: 'primary'
			},
			$invalid: { color: 'error' },
			$invalid$outline: { borderColor: 'error' },
			$invalid$outline$focused: {
				boxShadow: '0 0 0 1px var(--cxl-error)'
			},
			content: { position: 'relative' },
			mask: {
				position: 'absolute',
				top: 0,
				right: 0,
				left: 0,
				bottom: 0,
				backgroundColor: 'surface'
			},
			mask$outline: { borderRadius: 4 },
			mask$hover$hovered: {
				state: 'hover'
			},
			$disabled: { state: 'disabled' },
			mask$hover$hovered$disabled: { state: 'none' },

			label: {
				position: 'absolute',
				top: 10,
				left: 12,
				font: 'caption',
				lineHeight: 10,
				verticalAlign: 'bottom',
				transition:
					'transform var(--cxl-speed), font-size var(--cxl-speed)'
			},
			label$focused: { color: 'primary' },
			label$invalid: { color: 'error' },
			label$outline: {
				top: -5,
				left: 8,
				paddingLeft: 4,
				paddingRight: 4,
				marginBottom: 0,
				backgroundColor: 'inherit',
				display: 'inline-block'
			},
			label$floating: { font: 'default', translateY: 23, opacity: 0.75 },
			label$leading: { paddingLeft: 24 },
			label$floating$outline: { translateY: 27 }
		}
	});

	component(
		{
			name: 'cxl-field',
			attributes: ['floating', 'leading', 'outline', 'counter'],
			bindings: `
on(form.register):#onRegister
on(focusable.touched):#update
on(focusable.focus):#update
on(focusable.blur):#update

on(invalid):#update
on(input):#onChange
on(form.disabled):#update
on(click):#focus
	`,
			template: `
<cxl-field-base &="=focused:@focused =invalid:@invalid =disabled:@disabled =empty:@floating =leading:@leading =outline:@outline" hovered>
	<cxl-label-slot &="content(cxl-label):#onLabel"></cxl-label-slot>
	<cxl-field-content &="content .flex"></cxl-field-content>
	<cxl-focus-line &=".line =outline:hide =focused:@focused =invalid:@invalid =invalid:@touched"></cxl-focus-line>
</cxl-field-base>
<div &=".help">
	<div &=".grow">
		<cxl-field-help invalid &="=error:text:show"></cxl-field-help>
		<div &="=error:hide content(cxl-field-help)"></div>
	</div>
	<cxl-field-help &=".counter =counter:show =count:#getCountText:text"></cxl-field-help>
</div>
	`,
			styles: {
				$: { marginBottom: 16 },
				$outline: { paddingTop: 2 },
				flex: { display: 'flex', alignItems: 'center', lineHeight: 22 },
				line: { position: 'absolute', marginTop: 6, left: 0, right: 0 },
				help: { paddingLeft: 12, paddingRight: 12, display: 'flex' },
				grow: { flexGrow: 1 },
				counter: { float: 'right' },
				help$leading: { paddingLeft: 38 }
			}
		},
		{
			floating: false,
			leading: false,
			outline: false,
			label: null,

			getCountText(count) {
				return count + (this.max ? '/' + this.max : '');
			},

			onLabel(label) {
				requestAnimationFrame(() => {
					if (this.inputEl && !this.inputEl['aria-label'])
						this.inputEl['aria-label'] = label.textContent;
				});
			},

			onRegister(ev) {
				this.inputEl = ev.target;
			},

			onChange(ev) {
				const value = ev.target.value;
				this.empty = this.floating && !value;
				this.count = value ? value.length : 0;
				this.max = ev.target.maxlength;
			},

			focus() {
				if (this.inputEl) this.inputEl.focus();
			},

			update(ev) {
				var el = ev.target;

				this.disabled = el.disabled;
				this.focused = el.focused;

				if (el.touched) {
					this.invalid = el.invalid;
					this.error = el.$validity && el.$validity.message;
				}
			}
		}
	);

	component({
		name: 'cxl-form-group',
		extend: 'cxl-field',
		deprecated: true
	});

	component(
		{
			name: 'cxl-fieldset',
			attributes: ['outline'],
			template: `
<cxl-field-base &="on(invalid):#update =invalid:@invalid =outline:@outline">
	<cxl-label-slot &="content(cxl-label)"></cxl-label-slot>
	<cxl-field-content &="content .content"></cxl-field-content>
</cxl-field-base>
<div &=".help">
	<cxl-field-help invalid &="=error:text:show"></cxl-field-help>
	<div &="=error:hide content(cxl-field-help)"></div>
</div>
	`,
			styles: {
				$: { marginBottom: 16 },
				content: { display: 'block', marginTop: 16 },
				content$outline: { marginTop: 0 }
			}
		},
		{
			update(ev) {
				var el = ev.target;

				if (el.touched) {
					this.invalid = el.invalid;
					this.error = el.$validity && el.$validity.message;
				}
			}
		}
	);

	component(
		{
			name: 'cxl-input',
			extend: InputBase,
			attributes: ['maxlength', 'aria-label'],
			methods: ['focus'],
			template: `<input &="id(input) =type:|attribute(type) .input
	=aria-label:attribute(aria-label)
	=value:value
	=maxlength:filter:@maxLength value:=value
	=disabled:attribute(disabled) on(input):event.stop =name:attribute(name)
	=autocomplete:attribute(autocomplete)
	on(blur):host.trigger(blur) on(focus):host.trigger(focus)" />`,
			bindings: `role(textbox) focusable.events`,
			styles: {
				$: { flexGrow: 1, height: 22 },
				input: {
					font: 'default',
					border: 0,
					padding: 0,
					backgroundColor: 'transparent',
					margin: 0,
					color: 'onSurface',
					width: '100%',
					lineHeight: 22,
					textAlign: 'inherit',
					borderRadius: 0,
					outline: 0,
					fontFamily: 'inherit'
				},
				input$focus: { outline: 0 }
			}
		},
		{
			value: '',
			focusline: true,
			focused: false,
			name: null,
			autocomplete: null,
			type: 'text',
			invalid: false,
			maxlength: null,

			focus() {
				this.input.focus();
			}
		}
	);

	component(
		{
			name: 'cxl-password',
			extend: 'cxl-input'
		},
		{
			type: 'password'
		}
	);

	component({
		name: 'cxl-focus-line',
		attributes: ['focused', 'invalid', 'touched'],
		template: `<div &=".line"></div`,
		styles: {
			$: {
				position: 'absolute',
				left: 0,
				right: 0,
				height: 2,
				border: 0,
				borderBottom: 1,
				borderStyle: 'solid',
				borderColor: 'onSurface'
			},
			$invalid: { borderColor: 'error' },
			line: {
				backgroundColor: 'primary',
				scaleX: 0,
				height: 2
			},
			line$focused: { scaleX: 1 },
			line$invalid: { backgroundColor: 'error' }
		}
	});

	component({
		name: 'cxl-field-icon',
		extend: 'cxl-icon',
		styles: {
			$: {
				paddingRight: 8,
				lineHeight: 22,
				width: 24,
				textAlign: 'center'
			},
			$trailing: { paddingRight: 0, paddingLeft: 8 }
		}
	});

	component(
		{
			name: 'cxl-option',
			attributes: [
				'value',
				'selected',
				'multiple',
				'focused',
				'disabled',
				'inactive'
			],
			events: ['selectable.action', 'change'],
			template: `
<cxl-icon icon="check" &="=multiple:show .box"></cxl-icon>
<div &="content .content"></div>
	`,
			bindings: `
role(option) selectable
=value:host.trigger(change)
	`,
			styles: {
				$: {
					cursor: 'pointer',
					color: 'onSurface',
					lineHeight: 20,
					paddingRight: 16,
					display: 'flex',
					backgroundColor: 'surface',
					paddingLeft: 16,
					font: 'default',
					paddingTop: 14,
					paddingBottom: 14
				},
				box: {
					display: 'inline-block',
					width: 20,
					height: 20,
					border: 2,
					borderColor: 'onSurface',
					marginRight: 12,
					lineHeight: 16,
					borderStyle: 'solid',
					color: 'rgba(0,0,0,0)',
					fontSize: 'var(--cxl-fontSize)'
				},
				box$selected: {
					borderColor: 'primary',
					backgroundColor: 'primary',
					color: 'onPrimary'
				},
				checkbox: { marginBottom: 0, marginRight: 8 },
				content: { flexGrow: 1 },
				$hover: { state: 'hover' },
				$focused: { state: 'focus' },
				$selected: {
					backgroundColor: 'primaryLight',
					color: 'onPrimaryLight'
				},
				$disabled: { state: 'disabled' },
				$inactive: {
					backgroundColor: 'transparent',
					color: 'onSurface'
				}
			},
			initialize(state) {
				if (!state.value) state.value = this.innerText;
			}
		},
		{
			value: null
		}
	);

	component(
		{
			name: 'cxl-radio',
			extend: InputBase,
			template: `
<x &=".focusCircle .focusCirclePrimary"></x>
<x &=".box"><x &=".circle"></x></x>
<span &=".content content"></span>
	`,
			bindings: `
role(radio) focusable id(host)
action:#toggle
=name:#register
=checked:host.trigger(change):aria.prop(checked)
disconnect:#unregister
	`,
			styles: [
				{
					$: {
						position: 'relative',
						cursor: 'pointer',
						marginRight: 16,
						marginLeft: 0,
						paddingTop: 12,
						paddingBottom: 12
					},
					$disabled: { state: 'disabled' },
					$inline: { display: 'inline-block' },
					$invalid$touched: { color: 'error' },
					content: { lineHeight: 20 },
					circle: {
						borderRadius: 10,
						width: 10,
						height: 10,
						display: 'inline-block',
						backgroundColor: 'primary',
						scaleX: 0,
						scaleY: 0,
						marginTop: 3
					},
					circle$checked: { scaleX: 1, scaleY: 1 },
					circle$invalid$touched: { backgroundColor: 'error' },
					box: {
						border: 2,
						width: 20,
						height: 20,
						display: 'inline-block',
						borderColor: 'onSurface',
						marginRight: 8,
						borderRadius: 10,
						borderStyle: 'solid',
						color: 'primary',
						lineHeight: 16,
						textAlign: 'center'
					},
					box$checked: { borderColor: 'primary' },
					box$invalid$touched: { borderColor: 'error' },
					box$checked$invalid$touched: { color: 'error' }
				},
				FocusCircleCSS
			],

			attributes: ['checked']
		},
		{
			checked: false,

			register(name) {
				if (name && !this.registered) {
					radioValues.push(this.host);
					this.registered = true;
				}
			},

			unregister() {
				var i = radioValues.indexOf(this);

				if (i !== -1) radioValues.splice(i, 1);

				this.registered = false;
			},

			update() {
				if (this.name) {
					radioValues.forEach(r => {
						if (r.name === this.name && r !== this.host) {
							r.checked = false;
							r.touched = true;
						}
					});
				}
			},

			toggle() {
				if (this.disabled) return;

				if (!this.checked) {
					this.checked = this.touched = true;
					this.update();
				}
			}
		}
	);

	component({
		name: 'cxl-search-input',
		events: ['change'],
		attributes: ['value'],
		bindings: 'role(searchbox)',
		template: `
<cxl-icon icon="search" &=".icon"></cxl-icon>
<input &="value:=value =value:host.trigger(change) .input" placeholder="Search"></input>
	`,
		styles: {
			$: {
				elevation: 1,
				position: 'relative',
				padding: 16,
				paddingBottom: 14
			},
			icon: { position: 'absolute', top: 18 },
			input: {
				outline: 0,
				border: 0,
				width: '100%',
				backgroundColor: 'surface',
				color: 'onSurface',
				lineHeight: 24,
				padding: 0,
				paddingLeft: 48,
				font: 'default'
			}
		}
	});

	component({
		name: 'cxl-select-menu',
		attributes: ['visible', 'inline'],
		styles: {
			$: {
				position: 'absolute',
				elevation: 0,
				right: -16,
				left: -16,
				overflowY: 'hidden',
				transformOrigin: 'top'
			},
			$inline: {
				position: 'static',
				marginLeft: -16,
				marginRight: -16
			},
			$visible: {
				elevation: 3,
				overflowY: 'auto',
				backgroundColor: 'surface'
			}
		}
	});

	component(
		{
			name: 'cxl-select',
			extend: InputBase,
			template: `
<div &=".container =opened:.opened">
	<cxl-icon &=".icon" icon="caret-down" role="presentation"></cxl-icon>
	<cxl-select-menu &="id(menu) =menuHeight:style.inline(height)
		=menuTransform:style.inline(transform) =menuScroll:@scrollTop =menuTop:style.inline(top)
		=opened:@visible =inline:@inline content"></cxl-select-menu>
	<div &="=value:hide .placeholder =placeholder:text"></div>
	<div &="=value:show:#getSelectedText:text id(selectedText) .selectedText"></div>
</div>
	`,
			attributes: ['placeholder', 'inline'],
			bindings: `
		focusable
		selectable.host:#onSelected
		=focusedItem:navigation.select:#onNavigation
		id(component)
		keypress(escape):#close
		on(blur):#close
		root.on(click):#close
		action:#onAction:event.prevent:event.stop
		role(listbox)
	`,
			styles: {
				$: { cursor: 'pointer', flexGrow: 1, position: 'relative' },
				$disabled: { pointerEvents: 'none' },
				$focus: { outline: 0 },
				icon: {
					position: 'absolute',
					right: 0,
					top: 0,
					lineHeight: 20
				},
				placeholder: {
					color: 'onSurface',
					lineHeight: 20,
					paddingRight: 16,
					paddingLeft: 16,
					paddingTop: 14,
					paddingBottom: 14,
					position: 'absolute',
					left: -16,
					top: -11,
					right: 0,
					height: 48
				},
				container: {
					overflowY: 'hidden',
					overflowX: 'hidden',
					height: 22,
					position: 'relative',
					paddingRight: 16
				},
				opened: { overflowY: 'visible', overflowX: 'visible' }
			}
		},
		{
			opened: false,
			placeholder: '',
			selected: null,
			value: null,
			menuScroll: 0,
			menuTop: 0,

			getSelectedText() {
				return cxl.Skip;
			},

			updateMenu(selectedRect) {
				var rootRect = window,
					menuRect = this.menu,
					rect = this.component.getBoundingClientRect(),
					minTop = 56,
					maxTop = rect.top - minTop,
					maxHeight,
					marginTop = selectedRect ? selectedRect.offsetTop : 0,
					scrollTop = 0,
					height;
				if (marginTop > maxTop) {
					scrollTop = marginTop - maxTop;
					marginTop = maxTop;
				}

				height = menuRect.scrollHeight - scrollTop;
				maxHeight = rootRect.clientHeight - rect.bottom + marginTop;

				if (height > maxHeight) height = maxHeight;
				else if (height < minTop) height = minTop;

				this.menuTransform = 'translateY(' + (-marginTop - 11) + 'px)';
				this.menuHeight = height + 'px';
				this.menuScroll = scrollTop;
			},

			calculateDimensions() {
				this.calculateDimensions = cxl.debounceRender(() => {
					this._calculateDimensions();
					// TODO ?
					this.component.$view.digest();
				});

				this._calculateDimensions();
			},
			/**
			 * Calculate the menu dimensions based on content and position.
			 */
			_calculateDimensions() {
				const selectedRect = this.selected;
				if (this.opened) {
					if (selectedRect) selectedRect.inactive = false;
				} else if (!selectedRect) {
					this.menuHeight = 0;
					return;
				} else selectedRect.inactive = true;

				this.updateMenu(selectedRect);
			},

			onNavigation(el) {
				this.onSelected(el);
			},

			open() {
				if (this.disabled || this.opened) return;

				this.opened = true;
				this.calculateDimensions();
			},

			close() {
				if (this.opened) {
					this.opened = false;
					this.calculateDimensions();
				}
			},

			onSelected(selected) {
				if (selected) {
					if (this.value !== selected.value)
						this.value = selected.value;

					if (this.selected) this.selected.selected = false;

					selected.selected = true;
				}

				this.selected = selected;
				this.calculateDimensions();
			},

			onAction() {
				if (this.disabled) return;

				if (this.opened) this.close();
				else this.open();
			}
		}
	);

	component(
		{
			name: 'cxl-multiselect',
			extend: 'cxl-select',
			bindings:
				'on(selectable.register):#onRegister root.on(touchend):#close role(listbox) aria.prop(multiselectable)',
			styles: {
				selectedText: {
					color: 'onSurface',
					lineHeight: 20,
					paddingRight: 16,
					paddingLeft: 16,
					paddingTop: 14,
					paddingBottom: 14,
					position: 'absolute',
					left: -16,
					top: -11,
					right: 0,
					height: 48
				}
			}
		},
		{
			getSelectedText() {
				return (
					this.selected &&
					this.selected.map(s => s.innerText).join(', ')
				);
			},

			_calculateDimensions() {
				this.menuTransform = this.opened ? 'scaleY(1)' : 'scaleY(0)';
				this.menuTop = '31px';
			},

			onRegister(ev) {
				const el = ev.target;
				// TODO safe?
				el.multiple = true;
			},

			onNavigation(element) {
				if (this.focusedItem !== element) {
					if (this.focusedItem) this.focusedItem.focused = false;

					this.focusedItem = element;
					element.focused = true;
				}
			},

			onSelected(selectedEl) {
				if (selectedEl) {
					if (!this.selected) this.selected = [];

					const selected = this.selected,
						i = selected.indexOf(selectedEl);

					if (this.focusedItem) this.focusedItem.focused = false;

					if (i === -1) {
						selectedEl.selected = true;
						selected.push(selectedEl);
					} else {
						selectedEl.selected = false;
						selected.splice(i, 1);
					}

					selectedEl.focused = true;
					this.focusedItem = selectedEl;

					if (selected.length === 0)
						this.selected = this.value = null;
					else this.value = selected.map(o => o.value);
				}

				this.calculateDimensions();
			},

			onAction(ev) {
				if (this.disabled) return;

				if (this.opened) {
					if (ev.type === 'keyup' && this.focused) {
						this.onSelected(this.focusedItem);
						return ev.preventDefault();
					}

					if (ev.target === this.component) this.close();
				} else {
					if (this.focusedItem) {
						this.focusedItem.focused = false;
						this.focusedItem = null;
					}
					this.open();
				}
			},

			onMenuAction(ev) {
				if (this.opened) ev.stopPropagation();
			}
		}
	);

	component(
		{
			name: 'cxl-autocomplete',
			methods: ['focus'],
			extend: InputBase,
			template: `
	<input autocomplete="off" &="id(input) focusable.events .input value::=value keypress:#onKey on(blur):delay(150):#deselect" />
	<div &="=showMenu:#show content .menu"></div>
			`,
			styles: {
				input: {
					color: 'onSurface',
					lineHeight: 22,
					height: 22,
					outline: 0,
					border: 0,
					padding: 0,
					backgroundColor: 'transparent',
					width: '100%',
					textAlign: 'inherit',
					borderRadius: 0,
					font: 'default'
				},
				input$focus: { outline: 0 },

				menu: {
					position: 'absolute',
					left: -12,
					right: -12,
					top: 32,
					backgroundColor: 'surface',
					overflowY: 'auto',
					elevation: 1
				}
			},
			bindings: `
				navigation.list:#onNav
				=value:#applyFilter:#shouldShow
				on(selectable.action):event.stop:#onSelect
			`,
			initialize(state) {
				state.applyFilter = cxl.debounceRender(state.applyFilter);
			}
		},
		{
			showMenu: false,
			value: '',
			focus() {
				this.input.focus();
			},
			onSelect(ev) {
				this.select(ev.target);
				this.focus();
			},
			show(val, el) {
				if (val) {
					el.style.maxHeight = '250px';
					el.style.display = 'block';
				} else el.style.display = 'none';
			},

			select(option) {
				this.value = option.value;
				this.deselect();
				this.showMenu = null;
			},

			deselect() {
				if (this.focusedElement)
					this.focusedElement = this.focusedElement.selected = false;
				this.showMenu = false;
			},
			onNav(el) {
				if (this.focusedElement) this.focusedElement.selected = false;
				this.focusedElement = el;
				el.selected = true;
			},
			shouldShow() {
				this.showMenu =
					this.showMenu !== null && !!(this.value && this.focused);
			},

			onKey(ev) {
				switch (ev.key) {
					case 'Enter':
						if (this.focusedElement)
							this.select(this.focusedElement);
						break;
					case 'Escape':
						this.deselect();
						break;
				}
			},

			filter(regex, item) {
				if (item.tagName)
					item.style.display =
						regex && regex.test(item.value) ? 'block' : 'none';
			},

			applyFilter(term, el) {
				const regex = term && new RegExp(cxl.escapeRegex(term), 'i');
				cxl.dom.find(el, item => this.filter(regex, item));
			}
		}
	);

	component(
		{
			name: 'cxl-slider',
			extend: InputBase,
			attributes: ['step'],
			bindings: `
		focusable
		role(slider)
		keypress(arrowleft):#onLeft keypress(arrowright):#onRight
		drag.in(x):#onDrag
		=value:aria.prop(valuenow)
		=max:aria.prop(valuemax)
		=min:aria.prop(valuemin)
	`,
			template: `
<div &=".background">
	<div &=".line =value:#update"><x &=".focusCircle .focusCirclePrimary"></x>
	<div &=".knob"></div>
</div></div>
	`,
			styles: [
				{
					$: {
						paddingTop: 24,
						paddingBottom: 24,
						userSelect: 'none',
						position: 'relative',
						flexGrow: 1,
						cursor: 'pointer'
					},
					knob: {
						backgroundColor: 'primary',
						width: 12,
						height: 12,
						display: 'inline-block',
						borderRadius: 6,
						position: 'absolute',
						top: 19
					},
					$disabled: { state: 'disabled' },
					focusCircle: { marginLeft: -4, marginTop: -8 },
					background: { backgroundColor: 'primaryLight', height: 2 },
					line: {
						backgroundColor: 'primary',
						height: 2,
						textAlign: 'right'
					},
					line$invalid$touched: { backgroundColor: 'error' },
					knob$invalid$touched: { backgroundColor: 'error' },
					background$invalid$touched: { backgroundColor: 'error' }
				},
				FocusCircleCSS
			]
		},
		{
			max: 1,
			min: 0,
			value: 0,
			step: 0.05,

			onLeft() {
				this.value -= +this.step;
			},

			onRight() {
				this.value += +this.step;
			},

			update(value, el) {
				if (value < 0) value = 0;
				else if (value > 1) value = 1;

				el.style.marginRight = 100 - value * 100 + '%';

				return (this.value = value);
			},

			onDrag(x) {
				if (this.disabled) return;

				this.value = x;
			}
		}
	);

	component(
		{
			name: 'cxl-switch',
			extend: InputBase,
			template: `
<div &=".content content"></div>
<div &=".switch">
	<span &=".background =checked:#update"></span>
	<div &=".knob"><x &=".focusCircle"></x></div>
</div>
	`,
			attributes: ['checked', 'true-value', 'false-value'],
			bindings: `focusable action:#onClick role(switch) =checked:aria.prop(checked)`,
			styles: [
				{
					$: {
						display: 'flex',
						cursor: 'pointer',
						paddingTop: 12,
						paddingBottom: 12
					},
					$inline: { display: 'inline-flex' },
					content: { flexGrow: 1 },
					switch: {
						position: 'relative',
						width: 46,
						height: 20,
						userSelect: 'none'
					},
					background: {
						position: 'absolute',
						display: 'block',
						left: 10,
						top: 2,
						height: 16,
						borderRadius: 8,
						width: 26,
						backgroundColor: 'divider'
					},

					knob: {
						width: 20,
						height: 20,
						borderRadius: 10,
						backgroundColor: '#fff',
						position: 'absolute',
						elevation: 1
					},

					background$checked: { backgroundColor: 'primaryLight' },
					knob$checked: {
						translateX: 24,
						backgroundColor: 'primary'
					},
					knob$invalid$touched: { backgroundColor: 'error' },
					content$invalid$touched: { color: 'error' },
					focusCircle$checked: { backgroundColor: 'primary' },
					$disabled: { state: 'disabled' }
				},
				FocusCircleCSS
			]
		},
		{
			'true-value': true,
			'false-value': false,
			checked: false,

			update() {
				this.value = this[this.checked ? 'true-value' : 'false-value'];
			},

			onClick() {
				if (this.disabled) return;

				this.checked = !this.checked;
			}
		}
	);

	component(
		{
			name: 'cxl-textarea',
			methods: ['focus'],
			extend: InputBase,
			template: `
<div &="id(span) .input .measure"></div>
<textarea &="id(input) .input .textarea
	value:=value on(input):event.stop
	=value:value:#calculateHeight
	=aria-label:attribute(aria-label)
	=disabled:attribute(disabled)
	on(change):event.stop
	on(blur):host.trigger(blur) on(focus):host.trigger(focus)
"></textarea>
`,
			bindings: `
role(textbox) aria.prop(multiline) keypress(enter):event.stop focusable.events
	`,
			attributes: ['aria-label'],
			styles: {
				$: { position: 'relative', flexGrow: 1 },
				input: {
					font: 'default',
					backgroundColor: 'transparent',
					lineHeight: 20,
					fontFamily: 'inherit',
					border: 0,
					paddingLeft: 0,
					paddingRight: 0,
					paddingTop: 1,
					color: 'onSurface',
					paddingBottom: 1
				},
				textarea: {
					width: '100%',
					position: 'absolute',
					top: 0,
					left: 0,
					right: 0,
					bottom: 0,
					height: '100%',
					outline: 0,
					borderRadius: 0,
					margin: 0
				},
				measure: { opacity: 0, whiteSpace: 'pre-wrap' }
			}
		},
		{
			value: '',

			focus() {
				this.input.focus();
			},

			calculateHeight(val) {
				this.span.innerHTML = val + '&nbsp;';
			}
		}
	);

	component({
		name: 'cxl-field-control',
		events: ['change'],
		attributes: [
			'value',
			'invalid',
			'disabled',
			'touched',
			'focused',
			'name',
			'label',
			'outline',
			'floating'
		],
		styles: { $: { display: 'block' } }
	});

	component(
		{
			name: 'cxl-field-input',
			extend: 'cxl-field-control',
			attributes: ['maxlength'],
			template: `
<cxl-field &="=outline:@outline =floating:@floating">
	<cxl-label &="=label:text"></cxl-label>
	<cxl-input &="=maxlength:@maxlength =value::@value =invalid:@invalid =disabled:@disabled =touched:@touched =focused:@focused =name:@name =label:@aria-label"></cxl-input>
	<div &="content(cxl-field-help)" slot="cxl-field-help"></div>
</cxl-field>
	`
		},
		{
			value: ''
		}
	);

	component({
		name: 'cxl-field-password',
		extend: 'cxl-field-input',
		template: `
<cxl-field &="=outline:@outline =floating:@floating">
	<cxl-label &="=label:text"></cxl-label>
	<cxl-password &="=maxlength:@maxlength =value::@value =invalid:@invalid =disabled:@disabled =touched:@touched =focused:@focused =name:@name =label:@aria-label"></cxl-password>
	<div &="content(cxl-field-help)" slot="cxl-field-help"></div>
</cxl-field>
	`
	});

	component(
		{
			name: 'cxl-field-textarea',
			extend: 'cxl-field-control',
			template: `
<cxl-field &="=outline:@outline =floating:@floating">
	<cxl-label &="=label:show:text"></cxl-label>
	<cxl-textarea &="=value::@value =invalid:@invalid =disabled:@disabled =touched:@touched =focused:@focused =name:@name =label:@aria-label"></cxl-textarea>
	<div &="content(cxl-field-help)" slot="cxl-field-help"></div>
</cxl-field>
	`
		},
		{
			value: ''
		}
	);

	component(
		{
			name: 'cxl-form',
			events: ['submit'],
			attributes: ['autocomplete', 'elements'],
			bindings: `
role(form)
registable.host(form):=elements:#buildForm

on(cxl-form.submit):#onSubmit
keypress(enter):#onSubmit
	`,
			template: `
<div &="content"></div>
<form style="display:none;" method="post" &="id(form) on(submit):event.prevent:host.trigger(submit) =autocomplete:@autocomplete">
	<div &="id(inputs)"></div>
	<input &="id(input)" type="submit" />
</form>
	`,
			initialize(state) {
				state.id = 'cxl-form-' + ((Math.random() * 100) | 0);
			}
		},
		{
			autocomplete: 'off',

			buildForm(elements) {
				if (this.autocomplete !== 'on') return;

				const inputs = this.inputs;

				cxl.dom.empty(inputs);

				elements.forEach(el => {
					const i = cxl.dom('input');

					if (el.type === 'password') i.type = 'password';

					if (el.autocomplete) i.autocomplete = el.autocomplete;

					if (el.name) i.name = el.name;

					if (el.value) i.value = el.value;

					i.addEventListener('change', () => (el.value = i.value));
					el.addEventListener('change', () => (i.value = el.value));

					inputs.appendChild(i);
				});
			},

			// TODO better focusing
			onSubmit(ev) {
				let focus;

				if (this.elements) {
					this.elements.forEach(el => {
						if (el.invalid) focus = focus || el;

						el.touched = true;
					});

					if (focus) {
						focus.focus();
						return cxl.Skip;
					}
				}

				this.input.click();
				ev.stopPropagation();
			}
		}
	);

	component(
		{
			name: 'cxl-submit',
			extend: 'cxl-button',
			template: `
<cxl-icon &="=disabled:show =icon:@icon .icon"></cxl-icon>
<span &="content"></span>
	`,
			styles: {
				icon: { animation: 'spin', marginRight: 8 }
			},
			events: ['cxl-form.submit'],
			bindings: 'action:host.trigger(cxl-form.submit)'
		},
		{
			primary: true,
			icon: 'spinner',
			submit() {
				this.input.click();
			}
		}
	);
})();

(() => {
	const component = cxl.component,
		directive = cxl.directive,
		InputBase = cxl.ui.InputBase;
	directive('date', {
		update(val) {
			if (!val) return '';
			if (!(val instanceof Date)) val = new Date(val);
			return val.toLocaleDateString();
		}
	});

	directive('datetime', {
		update(val) {
			if (!val) return '';
			if (!(val instanceof Date)) val = new Date(val);
			return val.toLocaleDateString() + ' ' + val.toLocaleTimeString();
		}
	});

	directive('time', {
		update(val) {
			if (!val) return '';
			if (!(val instanceof Date)) val = new Date(val);
			return val.toLocaleTimeString();
		}
	});

	component(
		{
			name: 'cxl-calendar-date',
			extend: InputBase,
			attributes: ['selected'],
			bindings: 'focusable =label:aria.prop(label)',
			template: `<span &=".btn =value:#getDate:text"></span>`,
			styles: {
				$: { textAlign: 'center', cursor: 'pointer' },
				$disabled: { state: 'disabled' },
				$hover: { state: 'hover' },
				btn: {
					borderRadius: 40,
					width: 40,
					height: 40,
					lineHeight: 40,
					display: 'inline-block',
					padding: 0,
					backgroundColor: 'surface',
					color: 'onSurface',
					margin: 4
				},
				btn$selected: {
					backgroundColor: 'primary',
					color: 'onPrimary'
				}
			}
		},
		{
			getDate(val) {
				if (!val || typeof val === 'string') val = new Date(val);

				this.label = val.toDateString();

				return val.getDate();
			}
		}
	);

	component(
		{
			name: 'cxl-calendar-month',
			events: ['change'],
			attributes: ['value', 'month'],
			methods: ['focus'],
			template: `
<cxl-grid columns="repeat(7, auto)" gap="0" &="navigation.grid:#onNavigation">
		<cxl-th>S</cxl-th>
		<cxl-th>M</cxl-th>
		<cxl-th>T</cxl-th>
		<cxl-th>W</cxl-th>
		<cxl-th>T</cxl-th>
		<cxl-th>F</cxl-th>
		<cxl-th>S</cxl-th>
	<template &="=dates:marker.empty:each:repeat">
	<cxl-calendar-date &="action:#onAction $date:|@value $disabled:@disabled $today:.today:filter:#setTodayEl =value:#isSelected:@selected"></cxl-calendar-date>
	</template>
</cxl-table>
	`,
			bindings: `=month:#render =value:#parse`,
			styles: {
				$: { textAlign: 'center' },
				today: {
					border: 1,
					borderStyle: 'solid',
					borderColor: 'primary'
				}
			},
			initialize(state) {
				const now = new Date();
				state.today = new Date(
					now.getFullYear(),
					now.getMonth(),
					now.getDate()
				).getTime();
				state.month = state.month || now;
			}
		},
		{
			selected: null,
			value: null,
			todayEl: null,
			setFocus: false,

			setTodayEl(val, el) {
				if (val) this.todayEl = el;
			},

			focus() {
				const val = this.selected || this.todayEl;

				if (val) val.focus();
			},

			onNavigation(el) {
				el.focus();
			},

			parse(val) {
				if (val && !(val instanceof Date)) this.value = new Date(val);
			},

			isSelected(val, el) {
				const date = el.value,
					result =
						val &&
						date.getMonth() === val.getMonth() &&
						date.getFullYear() === val.getFullYear() &&
						date.getDate() === val.getDate();
				if (result) this.selected = el;

				return result;
			},

			setSelected(el) {
				this.value = el.value;
			},

			onAction(ev, el) {
				if (!el.disabled) this.setSelected(el);
			},

			getFirstDate(date) {
				const result = new Date(date.getFullYear(), date.getMonth(), 1);
				result.setDate(1 - result.getDay());
				return result;
			},

			getLastDate(date) {
				const result = new Date(
					date.getFullYear(),
					date.getMonth() + 1,
					1
				);
				result.setDate(7 - result.getDay());
				return result;
			},

			createItem(current) {
				return {
					date: new Date(current),
					disabled: current.getMonth() !== this.monthNumber,
					today: this.today === current.getTime()
				};
			},

			render(startDate) {
				if (!(startDate instanceof Date))
					startDate = new Date(startDate);

				const dates = (this.dates = []),
					lastDate = startDate && this.getLastDate(startDate);
				if (!startDate) return;

				this.monthNumber = startDate.getMonth();

				var current = this.getFirstDate(startDate);

				do {
					dates.push(this.createItem(current));
					current.setDate(current.getDate() + 1);
				} while (current <= lastDate || dates.length > 50);
			}
		}
	);

	component(
		{
			name: 'cxl-calendar-year',
			events: ['change'],
			attributes: ['value', 'start-year'],
			methods: ['focus'],
			template: `
<div &=".grid =columns:@columns navigation.grid:#onNav">
<template &="=years:marker.empty:each:repeat">
	<cxl-button flat &="item:text:data(value) action:#select =value:#isSelected:@primary"></cxl-button>
</template>
</div>
	`,
			styles: {
				$: {
					position: 'absolute',
					top: 0,
					left: 0,
					bottom: 0,
					right: 0,
					backgroundColor: 'surface',
					color: 'onSurface'
				},
				grid: {
					display: 'grid',
					height: '100%',
					gridTemplateColumns: '1fr 1fr 1fr 1fr'
				}
			},
			bindings: '=start-year:#render action:#select'
		},
		{
			columns: 4,

			focus() {
				// TODO
				setTimeout(() => {
					if (this.selected) this.selected.focus();
				});
			},

			onNav(el) {
				el.focus();
			},

			isSelected(val, el) {
				const result = el.value === val;

				if (result) this.selected = el;

				return result;
			},

			select(ev, target) {
				this.value = target.dataset.value;
			},

			render(startYear) {
				const years = (this.years = []);

				for (var i = startYear; i < startYear + 16; i++) years.push(i);
			}
		}
	);

	component({
		name: 'cxl-calendar-header',
		template: ``
	});

	component(
		{
			name: 'cxl-calendar',
			events: ['change'],
			attributes: ['value'],
			methods: ['focus'],
			template: `
<div &=".header action:event.stop">
	<cxl-button &="action:#toggleYear:#getMonthText" flat><x &="=monthText:text"></x>
	<cxl-icon icon="caret-down"></cxl-icon></cxl-button>
	<span &=".divider"></span>
	<cxl-button aria-label="Previus Month" &="action:#previousMonth" flat>&nbsp;<cxl-icon icon="arrow-left"></cxl-icon>&nbsp;</cxl-button>
	<cxl-button aria-label="Next Month" &="action:#nextMonth" flat>&nbsp;<cxl-icon icon="arrow-right"></cxl-icon>&nbsp;</cxl-button>
</div>
<div &=".rel">
	<cxl-calendar-month &="id(calendarMonth) =selectedMonth:@month @value:=value"></cxl-calendar-month>
	<cxl-calendar-year &="action:event.stop:not:=yearOpen =selectedYear::@value =startYear:@start-year @start-year:=startYear:#getMonthText .closed =yearOpen:.opened:filter:focus"></cxl-calendar-year>
</div>
	`,
			styles: {
				header: { display: 'flex', padding: 8 },
				divider: { flexGrow: 1 },
				closed: { scaleY: 0, transformOrigin: 'top' },
				opened: { scaleY: 1 },
				rel: { position: 'relative' }
			},
			bindings:
				'=value:#render =selectedMonth:#getMonthText =selectedYear:#updateMonth'
		},
		{
			today: null,
			value: null,
			calendarMonth: null,

			focus() {
				const val = this.value || this.today,
					month = this.selectedMonth;

				if (
					val.getMonth() !== month.getMonth() ||
					val.getFullYear() !== month.getFullYear()
				) {
					this.selectedMonth = new Date(val);
					this.selectedYear = this.selectedMonth.getFullYear();
				}

				// TODO ?
				setTimeout(() => this.calendarMonth.focus());
			},

			toggleYear() {
				this.yearOpen = !this.yearOpen;
				const year = this.selectedMonth.getFullYear();
				this.startYear = year - (year % 16);
				this.selectedYear = year;
			},

			updateMonth(year) {
				const month = this.selectedMonth;

				if (year && month.getFullYear() !== year) {
					month.setYear(year);
					this.selectedMonth = new Date(month);
				}
			},

			nextMonth() {
				if (this.yearOpen) this.startYear += 16;
				else {
					const c = this.selectedMonth;
					this.selectedMonth = new Date(
						c.getFullYear(),
						c.getMonth() + 1,
						1
					);
				}
			},

			previousMonth() {
				if (this.yearOpen) this.startYear -= 16;
				else {
					const c = this.selectedMonth;
					this.selectedMonth = new Date(
						c.getFullYear(),
						c.getMonth() - 1,
						1
					);
				}
			},

			getMonthText() {
				if (this.selectedMonth) {
					const options = { year: 'numeric', month: 'long' };
					this.monthText = this.yearOpen
						? this.startYear + '-' + (this.startYear + 16)
						: this.selectedMonth.toLocaleDateString(
								navigator.language,
								options
						  );
				}
			},

			render(val) {
				this.today = new Date();
				if (!this.selectedMonth)
					this.selectedMonth = val ? new Date(val) : this.today;
			}
		}
	);

	component(
		{
			name: 'cxl-datepicker',
			extend: 'cxl-input',
			template: `
<input &="id(input) .input
	=aria-label:attribute(aria-label)
	=inputValue:value
	=maxlength:filter:@maxLength value:#onInput
	=disabled:attribute(disabled) on(input):event.stop =name:attribute(name)
	on(blur):host.trigger(blur) on(focus):host.trigger(focus)" />
<div &=".focusLine =focused:.expand"></div>
<cxl-icon-toggle icon="calendar" &=".icon =disabled:@disabled @opened:=opened">
<cxl-toggle-popup &="role(dialog)">
	<cxl-card>
		<cxl-calendar &="=opened:filter:focus @value:#update:=value =value:@value"></cxl-calendar>
	</cxl-card>
</cxl-toggle-popup>
</cxl-icon-toggle>
	`,
			styles: {
				$: { position: 'relative', flexGrow: 1, display: 'flex' },
				icon: { padding: 0 }
			}
		},
		{
			value: null,
			inputValue: '',

			onInput(val) {
				this.value = val && new Date(val);
			},

			update(date) {
				if (date && date !== this.value && !isNaN(date.getTime()))
					this.inputValue = date.toLocaleDateString();
				this.input.focus();
			}
		}
	);
})();

cxl.ui.version="2.2.0";})(this.cxl);
cxl.css.registerFont('Font Awesome\ 5 Free',{weight:900,url:'https://use.fontawesome.com/releases/v5.1.0/webfonts/fa-solid-900.woff2'});cxl.ui.icons={ad:"\uf641","address-book":"\uf2b9","address-card":"\uf2bb",adjust:"\uf042","air-freshener":"\uf5d0","align-center":"\uf037","align-justify":"\uf039","align-left":"\uf036","align-right":"\uf038",allergies:"\uf461",ambulance:"\uf0f9","american-sign-language-interpreting":"\uf2a3",anchor:"\uf13d","angle-double-down":"\uf103","angle-double-left":"\uf100","angle-double-right":"\uf101","angle-double-up":"\uf102","angle-down":"\uf107","angle-left":"\uf104","angle-right":"\uf105","angle-up":"\uf106",angry:"\uf556",ankh:"\uf644","apple-alt":"\uf5d1",archive:"\uf187",archway:"\uf557","arrow-alt-circle-down":"\uf358","arrow-alt-circle-left":"\uf359","arrow-alt-circle-right":"\uf35a","arrow-alt-circle-up":"\uf35b","arrow-circle-down":"\uf0ab","arrow-circle-left":"\uf0a8","arrow-circle-right":"\uf0a9","arrow-circle-up":"\uf0aa","arrow-down":"\uf063","arrow-left":"\uf060","arrow-right":"\uf061","arrow-up":"\uf062","arrows-alt":"\uf0b2","arrows-alt-h":"\uf337","arrows-alt-v":"\uf338","assistive-listening-systems":"\uf2a2",asterisk:"\uf069",at:"\uf1fa",atlas:"\uf558",atom:"\uf5d2","audio-description":"\uf29e",award:"\uf559",backspace:"\uf55a",backward:"\uf04a","balance-scale":"\uf24e",ban:"\uf05e","band-aid":"\uf462",barcode:"\uf02a",bars:"\uf0c9","baseball-ball":"\uf433","basketball-ball":"\uf434",bath:"\uf2cd","battery-empty":"\uf244","battery-full":"\uf240","battery-half":"\uf242","battery-quarter":"\uf243","battery-three-quarters":"\uf241",bed:"\uf236",beer:"\uf0fc",bell:"\uf0f3","bell-slash":"\uf1f6","bezier-curve":"\uf55b",bible:"\uf647",bicycle:"\uf206",binoculars:"\uf1e5","birthday-cake":"\uf1fd",blender:"\uf517","blender-phone":"\uf6b6",blind:"\uf29d",bold:"\uf032",bolt:"\uf0e7",bomb:"\uf1e2",bone:"\uf5d7",bong:"\uf55c",book:"\uf02d","book-dead":"\uf6b7","book-open":"\uf518","book-reader":"\uf5da",bookmark:"\uf02e","bowling-ball":"\uf436",box:"\uf466","box-open":"\uf49e",boxes:"\uf468",braille:"\uf2a1",brain:"\uf5dc",briefcase:"\uf0b1","briefcase-medical":"\uf469","broadcast-tower":"\uf519",broom:"\uf51a",brush:"\uf55d",bug:"\uf188",building:"\uf1ad",bullhorn:"\uf0a1",bullseye:"\uf140",burn:"\uf46a",bus:"\uf207","bus-alt":"\uf55e","business-time":"\uf64a",calculator:"\uf1ec",calendar:"\uf133","calendar-alt":"\uf073","calendar-check":"\uf274","calendar-minus":"\uf272","calendar-plus":"\uf271","calendar-times":"\uf273",camera:"\uf030","camera-retro":"\uf083",campground:"\uf6bb",cannabis:"\uf55f",capsules:"\uf46b",car:"\uf1b9","car-alt":"\uf5de","car-battery":"\uf5df","car-crash":"\uf5e1","car-side":"\uf5e4","caret-down":"\uf0d7","caret-left":"\uf0d9","caret-right":"\uf0da","caret-square-down":"\uf150","caret-square-left":"\uf191","caret-square-right":"\uf152","caret-square-up":"\uf151","caret-up":"\uf0d8","cart-arrow-down":"\uf218","cart-plus":"\uf217",cat:"\uf6be",certificate:"\uf0a3",chair:"\uf6c0",chalkboard:"\uf51b","chalkboard-teacher":"\uf51c","charging-station":"\uf5e7","chart-area":"\uf1fe","chart-bar":"\uf080","chart-line":"\uf201","chart-pie":"\uf200",check:"\uf00c","check-circle":"\uf058","check-double":"\uf560","check-square":"\uf14a",chess:"\uf439","chess-bishop":"\uf43a","chess-board":"\uf43c","chess-king":"\uf43f","chess-knight":"\uf441","chess-pawn":"\uf443","chess-queen":"\uf445","chess-rook":"\uf447","chevron-circle-down":"\uf13a","chevron-circle-left":"\uf137","chevron-circle-right":"\uf138","chevron-circle-up":"\uf139","chevron-down":"\uf078","chevron-left":"\uf053","chevron-right":"\uf054","chevron-up":"\uf077",child:"\uf1ae",church:"\uf51d",circle:"\uf111","circle-notch":"\uf1ce",city:"\uf64f",clipboard:"\uf328","clipboard-check":"\uf46c","clipboard-list":"\uf46d",clock:"\uf017",clone:"\uf24d","closed-captioning":"\uf20a",cloud:"\uf0c2","cloud-download-alt":"\uf381","cloud-meatball":"\uf73b","cloud-moon":"\uf6c3","cloud-moon-rain":"\uf73c","cloud-rain":"\uf73d","cloud-showers-heavy":"\uf740","cloud-sun":"\uf6c4","cloud-sun-rain":"\uf743","cloud-upload-alt":"\uf382",cocktail:"\uf561",code:"\uf121","code-branch":"\uf126",coffee:"\uf0f4",cog:"\uf013",cogs:"\uf085",coins:"\uf51e",columns:"\uf0db",comment:"\uf075","comment-alt":"\uf27a","comment-dollar":"\uf651","comment-dots":"\uf4ad","comment-slash":"\uf4b3",comments:"\uf086","comments-dollar":"\uf653","compact-disc":"\uf51f",compass:"\uf14e",compress:"\uf066","concierge-bell":"\uf562",cookie:"\uf563","cookie-bite":"\uf564",copy:"\uf0c5",copyright:"\uf1f9",couch:"\uf4b8","credit-card":"\uf09d",crop:"\uf125","crop-alt":"\uf565",cross:"\uf654",crosshairs:"\uf05b",crow:"\uf520",crown:"\uf521",cube:"\uf1b2",cubes:"\uf1b3",cut:"\uf0c4",database:"\uf1c0",deaf:"\uf2a4",democrat:"\uf747",desktop:"\uf108",dharmachakra:"\uf655",diagnoses:"\uf470",dice:"\uf522","dice-d20":"\uf6cf","dice-d6":"\uf6d1","dice-five":"\uf523","dice-four":"\uf524","dice-one":"\uf525","dice-six":"\uf526","dice-three":"\uf527","dice-two":"\uf528","digital-tachograph":"\uf566",directions:"\uf5eb",divide:"\uf529",dizzy:"\uf567",dna:"\uf471",dog:"\uf6d3","dollar-sign":"\uf155",dolly:"\uf472","dolly-flatbed":"\uf474",donate:"\uf4b9","door-closed":"\uf52a","door-open":"\uf52b","dot-circle":"\uf192",dove:"\uf4ba",download:"\uf019","drafting-compass":"\uf568",dragon:"\uf6d5","draw-polygon":"\uf5ee",drum:"\uf569","drum-steelpan":"\uf56a","drumstick-bite":"\uf6d7",dumbbell:"\uf44b",dungeon:"\uf6d9",edit:"\uf044",eject:"\uf052","ellipsis-h":"\uf141","ellipsis-v":"\uf142",envelope:"\uf0e0","envelope-open":"\uf2b6","envelope-open-text":"\uf658","envelope-square":"\uf199",equals:"\uf52c",eraser:"\uf12d","euro-sign":"\uf153","exchange-alt":"\uf362",exclamation:"\uf12a","exclamation-circle":"\uf06a","exclamation-triangle":"\uf071",expand:"\uf065","expand-arrows-alt":"\uf31e","external-link-alt":"\uf35d","external-link-square-alt":"\uf360",eye:"\uf06e","eye-dropper":"\uf1fb","eye-slash":"\uf070","fast-backward":"\uf049","fast-forward":"\uf050",fax:"\uf1ac",feather:"\uf52d","feather-alt":"\uf56b",female:"\uf182","fighter-jet":"\uf0fb",file:"\uf15b","file-alt":"\uf15c","file-archive":"\uf1c6","file-audio":"\uf1c7","file-code":"\uf1c9","file-contract":"\uf56c","file-csv":"\uf6dd","file-download":"\uf56d","file-excel":"\uf1c3","file-export":"\uf56e","file-image":"\uf1c5","file-import":"\uf56f","file-invoice":"\uf570","file-invoice-dollar":"\uf571","file-medical":"\uf477","file-medical-alt":"\uf478","file-pdf":"\uf1c1","file-powerpoint":"\uf1c4","file-prescription":"\uf572","file-signature":"\uf573","file-upload":"\uf574","file-video":"\uf1c8","file-word":"\uf1c2",fill:"\uf575","fill-drip":"\uf576",film:"\uf008",filter:"\uf0b0",fingerprint:"\uf577",fire:"\uf06d","fire-extinguisher":"\uf134","first-aid":"\uf479",fish:"\uf578","fist-raised":"\uf6de",flag:"\uf024","flag-checkered":"\uf11e","flag-usa":"\uf74d",flask:"\uf0c3",flushed:"\uf579",folder:"\uf07b","folder-minus":"\uf65d","folder-open":"\uf07c","folder-plus":"\uf65e",font:"\uf031","font-awesome-logo-full":"\uf4e6","football-ball":"\uf44e",forward:"\uf04e",frog:"\uf52e",frown:"\uf119","frown-open":"\uf57a","funnel-dollar":"\uf662",futbol:"\uf1e3",gamepad:"\uf11b","gas-pump":"\uf52f",gavel:"\uf0e3",gem:"\uf3a5",genderless:"\uf22d",ghost:"\uf6e2",gift:"\uf06b","glass-martini":"\uf000","glass-martini-alt":"\uf57b",glasses:"\uf530",globe:"\uf0ac","globe-africa":"\uf57c","globe-americas":"\uf57d","globe-asia":"\uf57e","golf-ball":"\uf450",gopuram:"\uf664","graduation-cap":"\uf19d","greater-than":"\uf531","greater-than-equal":"\uf532",grimace:"\uf57f",grin:"\uf580","grin-alt":"\uf581","grin-beam":"\uf582","grin-beam-sweat":"\uf583","grin-hearts":"\uf584","grin-squint":"\uf585","grin-squint-tears":"\uf586","grin-stars":"\uf587","grin-tears":"\uf588","grin-tongue":"\uf589","grin-tongue-squint":"\uf58a","grin-tongue-wink":"\uf58b","grin-wink":"\uf58c","grip-horizontal":"\uf58d","grip-vertical":"\uf58e","h-square":"\uf0fd",hammer:"\uf6e3",hamsa:"\uf665","hand-holding":"\uf4bd","hand-holding-heart":"\uf4be","hand-holding-usd":"\uf4c0","hand-lizard":"\uf258","hand-paper":"\uf256","hand-peace":"\uf25b","hand-point-down":"\uf0a7","hand-point-left":"\uf0a5","hand-point-right":"\uf0a4","hand-point-up":"\uf0a6","hand-pointer":"\uf25a","hand-rock":"\uf255","hand-scissors":"\uf257","hand-spock":"\uf259",hands:"\uf4c2","hands-helping":"\uf4c4",handshake:"\uf2b5",hanukiah:"\uf6e6",hashtag:"\uf292","hat-wizard":"\uf6e8",haykal:"\uf666",hdd:"\uf0a0",heading:"\uf1dc",headphones:"\uf025","headphones-alt":"\uf58f",headset:"\uf590",heart:"\uf004",heartbeat:"\uf21e",helicopter:"\uf533",highlighter:"\uf591",hiking:"\uf6ec",hippo:"\uf6ed",history:"\uf1da","hockey-puck":"\uf453",home:"\uf015",horse:"\uf6f0",hospital:"\uf0f8","hospital-alt":"\uf47d","hospital-symbol":"\uf47e","hot-tub":"\uf593",hotel:"\uf594",hourglass:"\uf254","hourglass-end":"\uf253","hourglass-half":"\uf252","hourglass-start":"\uf251","house-damage":"\uf6f1",hryvnia:"\uf6f2","i-cursor":"\uf246","id-badge":"\uf2c1","id-card":"\uf2c2","id-card-alt":"\uf47f",image:"\uf03e",images:"\uf302",inbox:"\uf01c",indent:"\uf03c",industry:"\uf275",infinity:"\uf534",info:"\uf129","info-circle":"\uf05a",italic:"\uf033",jedi:"\uf669",joint:"\uf595","journal-whills":"\uf66a",kaaba:"\uf66b",key:"\uf084",keyboard:"\uf11c",khanda:"\uf66d",kiss:"\uf596","kiss-beam":"\uf597","kiss-wink-heart":"\uf598","kiwi-bird":"\uf535",landmark:"\uf66f",language:"\uf1ab",laptop:"\uf109","laptop-code":"\uf5fc",laugh:"\uf599","laugh-beam":"\uf59a","laugh-squint":"\uf59b","laugh-wink":"\uf59c","layer-group":"\uf5fd",leaf:"\uf06c",lemon:"\uf094","less-than":"\uf536","less-than-equal":"\uf537","level-down-alt":"\uf3be","level-up-alt":"\uf3bf","life-ring":"\uf1cd",lightbulb:"\uf0eb",link:"\uf0c1","lira-sign":"\uf195",list:"\uf03a","list-alt":"\uf022","list-ol":"\uf0cb","list-ul":"\uf0ca","location-arrow":"\uf124",lock:"\uf023","lock-open":"\uf3c1","long-arrow-alt-down":"\uf309","long-arrow-alt-left":"\uf30a","long-arrow-alt-right":"\uf30b","long-arrow-alt-up":"\uf30c","low-vision":"\uf2a8","luggage-cart":"\uf59d",magic:"\uf0d0",magnet:"\uf076","mail-bulk":"\uf674",male:"\uf183",map:"\uf279","map-marked":"\uf59f","map-marked-alt":"\uf5a0","map-marker":"\uf041","map-marker-alt":"\uf3c5","map-pin":"\uf276","map-signs":"\uf277",marker:"\uf5a1",mars:"\uf222","mars-double":"\uf227","mars-stroke":"\uf229","mars-stroke-h":"\uf22b","mars-stroke-v":"\uf22a",mask:"\uf6fa",medal:"\uf5a2",medkit:"\uf0fa",meh:"\uf11a","meh-blank":"\uf5a4","meh-rolling-eyes":"\uf5a5",memory:"\uf538",menorah:"\uf676",mercury:"\uf223",meteor:"\uf753",microchip:"\uf2db",microphone:"\uf130","microphone-alt":"\uf3c9","microphone-alt-slash":"\uf539","microphone-slash":"\uf131",microscope:"\uf610",minus:"\uf068","minus-circle":"\uf056","minus-square":"\uf146",mobile:"\uf10b","mobile-alt":"\uf3cd","money-bill":"\uf0d6","money-bill-alt":"\uf3d1","money-bill-wave":"\uf53a","money-bill-wave-alt":"\uf53b","money-check":"\uf53c","money-check-alt":"\uf53d",monument:"\uf5a6",moon:"\uf186","mortar-pestle":"\uf5a7",mosque:"\uf678",motorcycle:"\uf21c",mountain:"\uf6fc","mouse-pointer":"\uf245",music:"\uf001","network-wired":"\uf6ff",neuter:"\uf22c",newspaper:"\uf1ea","not-equal":"\uf53e","notes-medical":"\uf481","object-group":"\uf247","object-ungroup":"\uf248","oil-can":"\uf613",om:"\uf679",otter:"\uf700",outdent:"\uf03b","paint-brush":"\uf1fc","paint-roller":"\uf5aa",palette:"\uf53f",pallet:"\uf482","paper-plane":"\uf1d8",paperclip:"\uf0c6","parachute-box":"\uf4cd",paragraph:"\uf1dd",parking:"\uf540",passport:"\uf5ab",pastafarianism:"\uf67b",paste:"\uf0ea",pause:"\uf04c","pause-circle":"\uf28b",paw:"\uf1b0",peace:"\uf67c",pen:"\uf304","pen-alt":"\uf305","pen-fancy":"\uf5ac","pen-nib":"\uf5ad","pen-square":"\uf14b","pencil-alt":"\uf303","pencil-ruler":"\uf5ae","people-carry":"\uf4ce",percent:"\uf295",percentage:"\uf541","person-booth":"\uf756",phone:"\uf095","phone-slash":"\uf3dd","phone-square":"\uf098","phone-volume":"\uf2a0","piggy-bank":"\uf4d3",pills:"\uf484","place-of-worship":"\uf67f",plane:"\uf072","plane-arrival":"\uf5af","plane-departure":"\uf5b0",play:"\uf04b","play-circle":"\uf144",plug:"\uf1e6",plus:"\uf067","plus-circle":"\uf055","plus-square":"\uf0fe",podcast:"\uf2ce",poll:"\uf681","poll-h":"\uf682",poo:"\uf2fe","poo-storm":"\uf75a",poop:"\uf619",portrait:"\uf3e0","pound-sign":"\uf154","power-off":"\uf011",pray:"\uf683","praying-hands":"\uf684",prescription:"\uf5b1","prescription-bottle":"\uf485","prescription-bottle-alt":"\uf486",print:"\uf02f",procedures:"\uf487","project-diagram":"\uf542","puzzle-piece":"\uf12e",qrcode:"\uf029",question:"\uf128","question-circle":"\uf059",quidditch:"\uf458","quote-left":"\uf10d","quote-right":"\uf10e",quran:"\uf687",rainbow:"\uf75b",random:"\uf074",receipt:"\uf543",recycle:"\uf1b8",redo:"\uf01e","redo-alt":"\uf2f9",registered:"\uf25d",reply:"\uf3e5","reply-all":"\uf122",republican:"\uf75e",retweet:"\uf079",ribbon:"\uf4d6",ring:"\uf70b",road:"\uf018",robot:"\uf544",rocket:"\uf135",route:"\uf4d7",rss:"\uf09e","rss-square":"\uf143","ruble-sign":"\uf158",ruler:"\uf545","ruler-combined":"\uf546","ruler-horizontal":"\uf547","ruler-vertical":"\uf548",running:"\uf70c","rupee-sign":"\uf156","sad-cry":"\uf5b3","sad-tear":"\uf5b4",save:"\uf0c7",school:"\uf549",screwdriver:"\uf54a",scroll:"\uf70e",search:"\uf002","search-dollar":"\uf688","search-location":"\uf689","search-minus":"\uf010","search-plus":"\uf00e",seedling:"\uf4d8",server:"\uf233",shapes:"\uf61f",share:"\uf064","share-alt":"\uf1e0","share-alt-square":"\uf1e1","share-square":"\uf14d","shekel-sign":"\uf20b","shield-alt":"\uf3ed",ship:"\uf21a","shipping-fast":"\uf48b","shoe-prints":"\uf54b","shopping-bag":"\uf290","shopping-basket":"\uf291","shopping-cart":"\uf07a",shower:"\uf2cc","shuttle-van":"\uf5b6",sign:"\uf4d9","sign-in-alt":"\uf2f6","sign-language":"\uf2a7","sign-out-alt":"\uf2f5",signal:"\uf012",signature:"\uf5b7",sitemap:"\uf0e8",skull:"\uf54c","skull-crossbones":"\uf714",slash:"\uf715","sliders-h":"\uf1de",smile:"\uf118","smile-beam":"\uf5b8","smile-wink":"\uf4da",smog:"\uf75f",smoking:"\uf48d","smoking-ban":"\uf54d",snowflake:"\uf2dc",socks:"\uf696","solar-panel":"\uf5ba",sort:"\uf0dc","sort-alpha-down":"\uf15d","sort-alpha-up":"\uf15e","sort-amount-down":"\uf160","sort-amount-up":"\uf161","sort-down":"\uf0dd","sort-numeric-down":"\uf162","sort-numeric-up":"\uf163","sort-up":"\uf0de",spa:"\uf5bb","space-shuttle":"\uf197",spider:"\uf717",spinner:"\uf110",splotch:"\uf5bc","spray-can":"\uf5bd",square:"\uf0c8","square-full":"\uf45c","square-root-alt":"\uf698",stamp:"\uf5bf",star:"\uf005","star-and-crescent":"\uf699","star-half":"\uf089","star-half-alt":"\uf5c0","star-of-david":"\uf69a","star-of-life":"\uf621","step-backward":"\uf048","step-forward":"\uf051",stethoscope:"\uf0f1","sticky-note":"\uf249",stop:"\uf04d","stop-circle":"\uf28d",stopwatch:"\uf2f2",store:"\uf54e","store-alt":"\uf54f",stream:"\uf550","street-view":"\uf21d",strikethrough:"\uf0cc",stroopwafel:"\uf551",subscript:"\uf12c",subway:"\uf239",suitcase:"\uf0f2","suitcase-rolling":"\uf5c1",sun:"\uf185",superscript:"\uf12b",surprise:"\uf5c2",swatchbook:"\uf5c3",swimmer:"\uf5c4","swimming-pool":"\uf5c5",synagogue:"\uf69b",sync:"\uf021","sync-alt":"\uf2f1",syringe:"\uf48e",table:"\uf0ce","table-tennis":"\uf45d",tablet:"\uf10a","tablet-alt":"\uf3fa",tablets:"\uf490","tachometer-alt":"\uf3fd",tag:"\uf02b",tags:"\uf02c",tape:"\uf4db",tasks:"\uf0ae",taxi:"\uf1ba",teeth:"\uf62e","teeth-open":"\uf62f","temperature-high":"\uf769","temperature-low":"\uf76b",terminal:"\uf120","text-height":"\uf034","text-width":"\uf035",th:"\uf00a","th-large":"\uf009","th-list":"\uf00b","theater-masks":"\uf630",thermometer:"\uf491","thermometer-empty":"\uf2cb","thermometer-full":"\uf2c7","thermometer-half":"\uf2c9","thermometer-quarter":"\uf2ca","thermometer-three-quarters":"\uf2c8","thumbs-down":"\uf165","thumbs-up":"\uf164",thumbtack:"\uf08d","ticket-alt":"\uf3ff",times:"\uf00d","times-circle":"\uf057",tint:"\uf043","tint-slash":"\uf5c7",tired:"\uf5c8","toggle-off":"\uf204","toggle-on":"\uf205","toilet-paper":"\uf71e",toolbox:"\uf552",tooth:"\uf5c9",torah:"\uf6a0","torii-gate":"\uf6a1",tractor:"\uf722",trademark:"\uf25c","traffic-light":"\uf637",train:"\uf238",transgender:"\uf224","transgender-alt":"\uf225",trash:"\uf1f8","trash-alt":"\uf2ed",tree:"\uf1bb",trophy:"\uf091",truck:"\uf0d1","truck-loading":"\uf4de","truck-monster":"\uf63b","truck-moving":"\uf4df","truck-pickup":"\uf63c",tshirt:"\uf553",tty:"\uf1e4",tv:"\uf26c",umbrella:"\uf0e9","umbrella-beach":"\uf5ca",underline:"\uf0cd",undo:"\uf0e2","undo-alt":"\uf2ea","universal-access":"\uf29a",university:"\uf19c",unlink:"\uf127",unlock:"\uf09c","unlock-alt":"\uf13e",upload:"\uf093",user:"\uf007","user-alt":"\uf406","user-alt-slash":"\uf4fa","user-astronaut":"\uf4fb","user-check":"\uf4fc","user-circle":"\uf2bd","user-clock":"\uf4fd","user-cog":"\uf4fe","user-edit":"\uf4ff","user-friends":"\uf500","user-graduate":"\uf501","user-injured":"\uf728","user-lock":"\uf502","user-md":"\uf0f0","user-minus":"\uf503","user-ninja":"\uf504","user-plus":"\uf234","user-secret":"\uf21b","user-shield":"\uf505","user-slash":"\uf506","user-tag":"\uf507","user-tie":"\uf508","user-times":"\uf235",users:"\uf0c0","users-cog":"\uf509","utensil-spoon":"\uf2e5",utensils:"\uf2e7","vector-square":"\uf5cb",venus:"\uf221","venus-double":"\uf226","venus-mars":"\uf228",vial:"\uf492",vials:"\uf493",video:"\uf03d","video-slash":"\uf4e2",vihara:"\uf6a7","volleyball-ball":"\uf45f","volume-down":"\uf027","volume-mute":"\uf6a9","volume-off":"\uf026","volume-up":"\uf028","vote-yea":"\uf772","vr-cardboard":"\uf729",walking:"\uf554",wallet:"\uf555",warehouse:"\uf494",water:"\uf773",weight:"\uf496","weight-hanging":"\uf5cd",wheelchair:"\uf193",wifi:"\uf1eb",wind:"\uf72e","window-close":"\uf410","window-maximize":"\uf2d0","window-minimize":"\uf2d1","window-restore":"\uf2d2","wine-bottle":"\uf72f","wine-glass":"\uf4e3","wine-glass-alt":"\uf5ce","won-sign":"\uf159",wrench:"\uf0ad","x-ray":"\uf497","yen-sign":"\uf157","yin-yang":"\uf6ad"};
(cxl => {
	'use strict';

	const PARAM_QUERY_REGEX = /([^&=]+)=?([^&]*)/g,
		optionalParam = /\((.*?)\)/g,
		namedParam = /(\(\?)?:\w+/g,
		splatParam = /\*\w+/g,
		escapeRegExp = /[\-{}\[\]+?.,\\\^$|#\s]/g,
		directive = cxl.directive,
		component = cxl.component;
	var ROUTEID = 0;
	function routeToRegExp(route) {
		var names = [],
			result;
		result = new RegExp(
			'^' +
				route
					.replace(escapeRegExp, '\\$&')
					.replace(optionalParam, '(?:$1)?')
					.replace(namedParam, function(match, optional) {
						names.push(match.substr(1));
						return optional ? match : '([^/?]+)';
					})
					.replace(splatParam, '([^?]*?)') +
				'(?:/$|\\?|$)'
		);
		result.names = names;

		return result;
	}

	class Fragment {
		constructor(path) {
			this.path = path;
			this.regex = routeToRegExp(path);
			this.parameters = this.regex.names;
		}

		_extractQuery(frag, result) {
			var pos = frag.indexOf('?'),
				query = pos !== -1 ? frag.slice(pos + 1) : null,
				m;
			while (query && (m = PARAM_QUERY_REGEX.exec(query)))
				result[m[1]] = decodeURIComponent(m[2]);

			return result;
		}

		getArguments(fragment) {
			var params = this.regex.exec(fragment).slice(1),
				result = {},
				me = this;
			params.forEach(function(param, i) {
				var p;
				// Don't decode the search params.
				p =
					i === params.length - 1
						? param || null
						: param
						? decodeURIComponent(param)
						: null;

				result[me.parameters[i]] = p;
			});

			return this._extractQuery(fragment, result);
		}

		test(hash) {
			return this.regex.test(hash);
		}

		toString() {
			return this.path;
		}
	}

	class Route {
		constructor(def, controller) {
			var names;

			if (def.path !== undefined) {
				this.path = new Fragment(def.path);
				names = this.path.parameters;

				if (names && names.length)
					def.attributes = def.attributes
						? def.attributes.concat(names)
						: names;
			}

			if (def.defaultRoute) cxl.router.setDefault(this);

			this.id = def.id || def.path;
			this.title = def.title;
			this.resolve = def.resolve;
			this.parent = def.parent;
			this.redirectTo = def.redirectTo;

			if (!def.name) this.name = def.name = 'cxl-route' + ROUTEID++;

			def = new cxl.ComponentDefinition(def, controller);

			this.Route = def.Component;
		}

		create(args) {
			if (this.resolve && this.resolve(args) === false) return null;

			const el = cxl.dom(this.name, args),
				title = this.title;

			el.$cxlRoute = this;

			if (title)
				el.$$routeTitle =
					typeof title === 'string' ? title : title.text;

			return el;
		}
	}

	/**
	 * Global router. By default it will only support
	 * one level/state.
	 */
	class Router {
		constructor() {
			this.routes = {};
			this.routesList = [];
			this.instances = {};
			this.subject = new cxl.rx.BehaviorSubject();
			this.currentRoute = null;
		}

		findRouteDefinition(hash) {
			return (
				this.routesList.find(function(r) {
					return r.path && r.path.test(hash);
				}) || this.defaultRoute
			);
		}

		registerRoute(route) {
			this.routes[route.id] = route;
			this.routesList.unshift(route);

			return route;
		}

		setDefault(route) {
			this.defaultRoute = route;
		}

		findRoute(id, args) {
			var route = this.instances[id],
				i,
				def;
			if (route) {
				def = this.routes[id];

				// TODO figure out better way
				if (def.resolve) def.resolve(args);

				for (i in args) route[i] = args[i];
			}

			return route;
		}

		executeRoute(route, args, instances) {
			var parentId = route.parent,
				Parent = parentId && this.routes[parentId],
				id = route.id,
				parent = Parent
					? this.executeRoute(Parent, args, instances)
					: cxl.router.root,
				instance = this.findRoute(id, args) || route.create(args);

			if (instance && parent && instance.parentNode !== parent) {
				cxl.dom.setContent(parent, instance);
			}

			instances[id] = instance;

			return instance;
		}

		discardOldRoutes(newInstances) {
			const oldInstances = this.instances;

			for (let i in oldInstances)
				if (newInstances[i] !== oldInstances[i]) delete oldInstances[i];
		}

		execute(Route, args) {
			const instances = {},
				current = (this.current = this.executeRoute(
					Route,
					args || {},
					instances
				));
			this.currentRoute = Route;
			this.discardOldRoutes(instances);
			this.instances = instances;
			this.subject.next(current);
		}

		getPath(routeId, params) {
			const path = this.routes[routeId].path;

			params = params || cxl.router.current;

			return path && cxl.replaceParameters(path.toString(), params);
		}

		/**
		 * Normalizes path.
		 */
		path(path) {
			return path;
		}

		goPath(path) {
			if (path[0] === '#')
				window.location.hash = this.path(path.slice(1));
			else window.location = path;
		}

		go(routeId, params) {
			this.goPath('#' + this.getPath(routeId, params));
		}
	}

	directive('route', {
		initialize() {
			cxl.router.root = this.element;
		},

		update(hash) {
			var router = cxl.router,
				path = hash.slice(1),
				route = cxl.router.findRouteDefinition(path),
				args;

			if (route) {
				args =
					route.path &&
					route.path.parameters &&
					route.path.parameters.length
						? route.path.getArguments(path)
						: null;
				// Abstract routes that redirectTo to a children or other
				if (route.redirectTo) {
					path = router.getPath(route.redirectTo, args);
					route = cxl.router.routes[route.redirectTo];
				}

				router.href = path;
				router.execute(route, args);
			}
		}
	});

	directive('route.change', {
		connect() {
			this.bindings = [cxl.router.subject.subscribe(this.set.bind(this))];
		}
	});

	directive('route.path', {
		digest() {
			return cxl.router.getPath(this.parameters);
		}
	});

	directive('route.go', {
		update(id) {
			cxl.router.go(this.parameter || id);
		}
	});

	directive('route.link', {
		connect() {
			this.bindings = [
				cxl.router.subject.subscribe(this.updateActive.bind(this))
			];
		},

		updateActive() {
			const router = cxl.router;
			// TODO optimize?
			this.element.selected =
				this.href === router.href ||
				(router.instances[this.route] &&
					router.href.indexOf(this.href + '/') === 0) ||
				(router.currentRoute === router.defaultRoute &&
					this.route === router.defaultRoute.id);
		},

		update(param, state) {
			if (this.parameter) {
				state = param;
				param = this.parameter;
			}

			if (!param) return;

			const path = (this.href = cxl.router.getPath(param, state));

			if (path !== this.value) {
				this.element.href = '#' + path;
				this.route = param;

				if (cxl.router.current) this.updateActive();
			}

			return path;
		},

		digest(state) {
			return this.update(state);
		}
	});

	directive('route.title', {
		initialize() {
			this.bindings = [
				cxl.router.subject.subscribe(this.owner.digest.bind(this.owner))
			];
		},

		update(title) {
			this.owner.host.$$routeTitle = title;
			// TODO use different observable?
			if (cxl.router.current) cxl.router.subject.next(cxl.router.current);
		},

		digest() {
			return this.owner.host.$$routeTitle;
		}
	});

	component(
		{
			name: 'cxl-router-title',
			extend: 'cxl-appbar-title',
			bindings: 'route.change:#render',
			template: `
<x &=".responsive">
	<a &=".link =href4:attribute(href) =title4:show:text"></a><x &=".link =title4:show">&gt;</x>
	<a &=".link =href3:attribute(href) =title3:show:text"></a><x &=".link =title3:show">&gt;</x>
	<a &=".link =href2:attribute(href) =title2:show:text"></a><x &=".link =title2:show">&gt;</x>
	<a &=".link =href1:attribute(href) =title1:show:text"></a><x &=".link =title1:show">&gt;</x>
</x>
<a &=".link =href0:attribute(href) =title0:text"></a>
	`,
			styles: {
				$: { lineHeight: 22, flexGrow: 1 },
				link: {
					display: 'inline-block',
					textDecoration: 'none',
					color: 'onPrimary',
					marginRight: 4
				},
				responsive: { display: 'none' },
				responsive$medium: { display: 'inline-block' }
			}
		},
		{
			render() {
				var current = cxl.router.current,
					i = 0,
					title,
					windowTitle,
					path;

				this.title0 = this.title1 = this.title2 = this.title3 = this.title4 = null;
				this.href0 = this.href1 = this.href2 = this.href3 = this.href4 =
					'';

				do {
					title = current.$$routeTitle;

					if (title) {
						windowTitle = windowTitle
							? windowTitle + ' - ' + title
							: title;
						this['title' + i] = title;
						path = cxl.router.getPath(current.$cxlRoute.id);
						this['href' + i] = path ? '#' + path : false;
						i++;
					}

					if (windowTitle) document.title = windowTitle;
				} while ((current = current.parentNode));
			}
		}
	);

	Object.assign(cxl, {
		router: new Router(),

		route(def, controller) {
			return cxl.router.registerRoute(new Route(def, controller));
		}
	});

	component({
		name: 'cxl-router',
		bindings: 'location:route'
	});

	component({
		name: 'cxl-router-appbar',
		template: `
<cxl-meta></cxl-meta>
<cxl-appbar>
	<cxl-navbar permanent &="content"></cxl-navbar>
	<cxl-router-title></cxl-router-title>
</cxl-appbar>
	`
	});

	component({
		name: 'cxl-router-content',
		styles: {
			content: {
				position: 'relative',
				flexGrow: 1,
				overflowY: 'auto',
				overflowScrolling: 'touch',
				backgroundColor: 'surface',
				color: 'onSurface'
			}
		}
	});

	component(
		{
			name: 'cxl-router-app',
			bindings: 'route.change:#onChange',
			template: `
<cxl-meta></cxl-meta>
<cxl-appbar &="=extendedTitle:@extended">
	<cxl-navbar permanent &="content"></cxl-navbar>
	<cxl-router-title &="=extendedTitle:@extended"></cxl-router-title>
</cxl-appbar>
<div &=".content role(main) id(content)">
	<div &=".router location:route"></div>
	<div &=".footer content(cxl-router-footer)"></div>
</div>
	`,
			styles: {
				$: { display: 'flex', flexDirection: 'column', height: '100%' },
				$large: { paddingLeft: 288 },
				content: {
					position: 'relative',
					flexGrow: 1,
					overflowY: 'auto',
					overflowScrolling: 'touch',
					backgroundColor: 'surface',
					color: 'onSurface',
					elevation: 0
				},
				router$marginless: { margin: 0 },
				footer: {},
				router: { margin: 16 },
				router$medium: { margin: 32 },
				router$large: { marginLeft: 64, marginRight: 64 },
				router$xlarge: { width: 1200 },
				router$xlarge$center: {
					marginLeft: 'auto',
					marginRight: 'auto'
				}
			}
		},
		{
			extendedTitle: false,
			onChange(route) {
				const def = route.$cxlRoute;

				this.extendedTitle =
					(def && def.title && def.title.extended) || false;
			}
		}
	);
})(this.cxl);

(cxl => {

function isJSON(xhr)
{
	var contentType = xhr.getResponseHeader('Content-Type');
	return contentType && contentType.indexOf('application/json')!==-1;
}

function ajax(def)
{
	function parse(xhr)
	{
		return isJSON(xhr) ?
			JSON.parse(xhr.responseText) : xhr.responseText;
	}

	return cxl.ajax.xhr(def).then(parse, function(xhr) {
		return Promise.reject(parse(xhr));
	});
}

cxl.ajax = Object.assign(ajax, {

	xhr(def)
	{
		return new Promise(function(resolve, reject) {
		var
			xhr = new XMLHttpRequest(),
			options = Object.assign({}, cxl.ajax.defaults, def),
			data
		;
			if (options.setup)
				options.setup(xhr);

			xhr.open(options.method, options.url);

			if ('data' in options)
			{
				if (options.contentType)
					xhr.setRequestHeader('Content-Type', options.contentType);

				data = options.dataType==='json' && typeof(options.data)!=='string' ?
					JSON.stringify(options.data) :
					options.data;
			}

			if (options.responseType)
				xhr.responseType = options.responseType;

			if (options.progress)
				xhr.addEventListener('progress', options.progress);

			xhr.onreadystatechange = function()
			{
				if (xhr.readyState===XMLHttpRequest.DONE)
				{
					// TODO Make sure we add other valid statuses
					if (xhr.status===200) resolve(xhr); else reject(xhr);
				}
			};

			xhr.send(data);
		});
	},

	get(url, params)
	{
		var q, i;

		if (params)
		{
			q = [];
			for (i in params)
				q.push(i + '=' + window.encodeURIComponent(params[i]));

			url += '?' + q.join('&');
		}

		return cxl.ajax({ url: url });
	},

	post(url, params)
	{
		return cxl.ajax({ method: 'POST', url: url, data: params });
	},

	defaults: {
		method: 'GET',
		contentType: 'application/json',
		// 'json', 'text' or 'arraybuffer'
		dataType: 'json',
		// function(xhr)
		setup: null
	}

});

})(this.cxl);

(()=>{window.module={ set exports(fn) { window.hljs = fn; } };
function deepFreeze(obj) {
    if (obj instanceof Map) {
        obj.clear = obj.delete = obj.set = function () {
            throw new Error('map is read-only');
        };
    } else if (obj instanceof Set) {
        obj.add = obj.clear = obj.delete = function () {
            throw new Error('set is read-only');
        };
    }

    // Freeze self
    Object.freeze(obj);

    Object.getOwnPropertyNames(obj).forEach(function (name) {
        var prop = obj[name];

        // Freeze prop if it is an object
        if (typeof prop == 'object' && !Object.isFrozen(prop)) {
            deepFreeze(prop);
        }
    });

    return obj;
}

var deepFreezeEs6 = deepFreeze;
var _default = deepFreeze;
deepFreezeEs6.default = _default;

class Response {
  /**
   * @param {CompiledMode} mode
   */
  constructor(mode) {
    // eslint-disable-next-line no-undefined
    if (mode.data === undefined) mode.data = {};

    this.data = mode.data;
  }

  ignoreMatch() {
    this.ignore = true;
  }
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHTML(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * performs a shallow merge of multiple objects into one
 *
 * @template T
 * @param {T} original
 * @param {Record<string,any>[]} objects
 * @returns {T} a single new object
 */
function inherit(original, ...objects) {
  /** @type Record<string,any> */
  const result = Object.create(null);

  for (const key in original) {
    result[key] = original[key];
  }
  objects.forEach(function(obj) {
    for (const key in obj) {
      result[key] = obj[key];
    }
  });
  return /** @type {T} */ (result);
}

/**
 * @typedef {object} Renderer
 * @property {(text: string) => void} addText
 * @property {(node: Node) => void} openNode
 * @property {(node: Node) => void} closeNode
 * @property {() => string} value
 */

/** @typedef {{kind?: string, sublanguage?: boolean}} Node */
/** @typedef {{walk: (r: Renderer) => void}} Tree */
/** */

const SPAN_CLOSE = '</span>';

/**
 * Determines if a node needs to be wrapped in <span>
 *
 * @param {Node} node */
const emitsWrappingTags = (node) => {
  return !!node.kind;
};

/** @type {Renderer} */
class HTMLRenderer {
  /**
   * Creates a new HTMLRenderer
   *
   * @param {Tree} parseTree - the parse tree (must support `walk` API)
   * @param {{classPrefix: string}} options
   */
  constructor(parseTree, options) {
    this.buffer = "";
    this.classPrefix = options.classPrefix;
    parseTree.walk(this);
  }

  /**
   * Adds texts to the output stream
   *
   * @param {string} text */
  addText(text) {
    this.buffer += escapeHTML(text);
  }

  /**
   * Adds a node open to the output stream (if needed)
   *
   * @param {Node} node */
  openNode(node) {
    if (!emitsWrappingTags(node)) return;

    let className = node.kind;
    if (!node.sublanguage) {
      className = `${this.classPrefix}${className}`;
    }
    this.span(className);
  }

  /**
   * Adds a node close to the output stream (if needed)
   *
   * @param {Node} node */
  closeNode(node) {
    if (!emitsWrappingTags(node)) return;

    this.buffer += SPAN_CLOSE;
  }

  /**
   * returns the accumulated buffer
  */
  value() {
    return this.buffer;
  }

  // helpers

  /**
   * Builds a span element
   *
   * @param {string} className */
  span(className) {
    this.buffer += `<span class="${className}">`;
  }
}

/** @typedef {{kind?: string, sublanguage?: boolean, children: Node[]} | string} Node */
/** @typedef {{kind?: string, sublanguage?: boolean, children: Node[]} } DataNode */
/**  */

class TokenTree {
  constructor() {
    /** @type DataNode */
    this.rootNode = { children: [] };
    this.stack = [this.rootNode];
  }

  get top() {
    return this.stack[this.stack.length - 1];
  }

  get root() { return this.rootNode; }

  /** @param {Node} node */
  add(node) {
    this.top.children.push(node);
  }

  /** @param {string} kind */
  openNode(kind) {
    /** @type Node */
    const node = { kind, children: [] };
    this.add(node);
    this.stack.push(node);
  }

  closeNode() {
    if (this.stack.length > 1) {
      return this.stack.pop();
    }
    // eslint-disable-next-line no-undefined
    return undefined;
  }

  closeAllNodes() {
    while (this.closeNode());
  }

  toJSON() {
    return JSON.stringify(this.rootNode, null, 4);
  }

  /**
   * @typedef { import("./html_renderer").Renderer } Renderer
   * @param {Renderer} builder
   */
  walk(builder) {
    // this does not
    return this.constructor._walk(builder, this.rootNode);
    // this works
    // return TokenTree._walk(builder, this.rootNode);
  }

  /**
   * @param {Renderer} builder
   * @param {Node} node
   */
  static _walk(builder, node) {
    if (typeof node === "string") {
      builder.addText(node);
    } else if (node.children) {
      builder.openNode(node);
      node.children.forEach((child) => this._walk(builder, child));
      builder.closeNode(node);
    }
    return builder;
  }

  /**
   * @param {Node} node
   */
  static _collapse(node) {
    if (typeof node === "string") return;
    if (!node.children) return;

    if (node.children.every(el => typeof el === "string")) {
      // node.text = node.children.join("");
      // delete node.children;
      node.children = [node.children.join("")];
    } else {
      node.children.forEach((child) => {
        TokenTree._collapse(child);
      });
    }
  }
}

/**
  Currently this is all private API, but this is the minimal API necessary
  that an Emitter must implement to fully support the parser.

  Minimal interface:

  - addKeyword(text, kind)
  - addText(text)
  - addSublanguage(emitter, subLanguageName)
  - finalize()
  - openNode(kind)
  - closeNode()
  - closeAllNodes()
  - toHTML()

*/

/**
 * @implements {Emitter}
 */
class TokenTreeEmitter extends TokenTree {
  /**
   * @param {*} options
   */
  constructor(options) {
    super();
    this.options = options;
  }

  /**
   * @param {string} text
   * @param {string} kind
   */
  addKeyword(text, kind) {
    if (text === "") { return; }

    this.openNode(kind);
    this.addText(text);
    this.closeNode();
  }

  /**
   * @param {string} text
   */
  addText(text) {
    if (text === "") { return; }

    this.add(text);
  }

  /**
   * @param {Emitter & {root: DataNode}} emitter
   * @param {string} name
   */
  addSublanguage(emitter, name) {
    /** @type DataNode */
    const node = emitter.root;
    node.kind = name;
    node.sublanguage = true;
    this.add(node);
  }

  toHTML() {
    const renderer = new HTMLRenderer(this, this.options);
    return renderer.value();
  }

  finalize() {
    return true;
  }
}

/**
 * @param {string} value
 * @returns {RegExp}
 * */
function escape(value) {
  return new RegExp(value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'm');
}

/**
 * @param {RegExp | string } re
 * @returns {string}
 */
function source(re) {
  if (!re) return null;
  if (typeof re === "string") return re;

  return re.source;
}

/**
 * @param {...(RegExp | string) } args
 * @returns {string}
 */
function concat(...args) {
  const joined = args.map((x) => source(x)).join("");
  return joined;
}

/**
 * Any of the passed expresssions may match
 *
 * Creates a huge this | this | that | that match
 * @param {(RegExp | string)[] } args
 * @returns {string}
 */
function either(...args) {
  const joined = '(' + args.map((x) => source(x)).join("|") + ")";
  return joined;
}

/**
 * @param {RegExp} re
 * @returns {number}
 */
function countMatchGroups(re) {
  return (new RegExp(re.toString() + '|')).exec('').length - 1;
}

/**
 * Does lexeme start with a regular expression match at the beginning
 * @param {RegExp} re
 * @param {string} lexeme
 */
function startsWith(re, lexeme) {
  const match = re && re.exec(lexeme);
  return match && match.index === 0;
}

// join logically computes regexps.join(separator), but fixes the
// backreferences so they continue to match.
// it also places each individual regular expression into it's own
// match group, keeping track of the sequencing of those match groups
// is currently an exercise for the caller. :-)
/**
 * @param {(string | RegExp)[]} regexps
 * @param {string} separator
 * @returns {string}
 */
function join(regexps, separator = "|") {
  // backreferenceRe matches an open parenthesis or backreference. To avoid
  // an incorrect parse, it additionally matches the following:
  // - [...] elements, where the meaning of parentheses and escapes change
  // - other escape sequences, so we do not misparse escape sequences as
  //   interesting elements
  // - non-matching or lookahead parentheses, which do not capture. These
  //   follow the '(' with a '?'.
  const backreferenceRe = /\[(?:[^\\\]]|\\.)*\]|\(\??|\\([1-9][0-9]*)|\\./;
  let numCaptures = 0;
  let ret = '';
  for (let i = 0; i < regexps.length; i++) {
    numCaptures += 1;
    const offset = numCaptures;
    let re = source(regexps[i]);
    if (i > 0) {
      ret += separator;
    }
    ret += "(";
    while (re.length > 0) {
      const match = backreferenceRe.exec(re);
      if (match == null) {
        ret += re;
        break;
      }
      ret += re.substring(0, match.index);
      re = re.substring(match.index + match[0].length);
      if (match[0][0] === '\\' && match[1]) {
        // Adjust the backreference.
        ret += '\\' + String(Number(match[1]) + offset);
      } else {
        ret += match[0];
        if (match[0] === '(') {
          numCaptures++;
        }
      }
    }
    ret += ")";
  }
  return ret;
}

// Common regexps
const IDENT_RE = '[a-zA-Z]\\w*';
const UNDERSCORE_IDENT_RE = '[a-zA-Z_]\\w*';
const NUMBER_RE = '\\b\\d+(\\.\\d+)?';
const C_NUMBER_RE = '(-?)(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)'; // 0x..., 0..., decimal, float
const BINARY_NUMBER_RE = '\\b(0b[01]+)'; // 0b...
const RE_STARTERS_RE = '!|!=|!==|%|%=|&|&&|&=|\\*|\\*=|\\+|\\+=|,|-|-=|/=|/|:|;|<<|<<=|<=|<|===|==|=|>>>=|>>=|>=|>>>|>>|>|\\?|\\[|\\{|\\(|\\^|\\^=|\\||\\|=|\\|\\||~';

/**
* @param { Partial<Mode> & {binary?: string | RegExp} } opts
*/
const SHEBANG = (opts = {}) => {
  const beginShebang = /^#![ ]*\//;
  if (opts.binary) {
    opts.begin = concat(
      beginShebang,
      /.*\b/,
      opts.binary,
      /\b.*/);
  }
  return inherit({
    className: 'meta',
    begin: beginShebang,
    end: /$/,
    relevance: 0,
    /** @type {ModeCallback} */
    "on:begin": (m, resp) => {
      if (m.index !== 0) resp.ignoreMatch();
    }
  }, opts);
};

// Common modes
const BACKSLASH_ESCAPE = {
  begin: '\\\\[\\s\\S]', relevance: 0
};
const APOS_STRING_MODE = {
  className: 'string',
  begin: '\'',
  end: '\'',
  illegal: '\\n',
  contains: [BACKSLASH_ESCAPE]
};
const QUOTE_STRING_MODE = {
  className: 'string',
  begin: '"',
  end: '"',
  illegal: '\\n',
  contains: [BACKSLASH_ESCAPE]
};
const PHRASAL_WORDS_MODE = {
  begin: /\b(a|an|the|are|I'm|isn't|don't|doesn't|won't|but|just|should|pretty|simply|enough|gonna|going|wtf|so|such|will|you|your|they|like|more)\b/
};
/**
 * Creates a comment mode
 *
 * @param {string | RegExp} begin
 * @param {string | RegExp} end
 * @param {Mode | {}} [modeOptions]
 * @returns {Partial<Mode>}
 */
const COMMENT = function(begin, end, modeOptions = {}) {
  const mode = inherit(
    {
      className: 'comment',
      begin,
      end,
      contains: []
    },
    modeOptions
  );
  mode.contains.push(PHRASAL_WORDS_MODE);
  mode.contains.push({
    className: 'doctag',
    begin: '(?:TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX):',
    relevance: 0
  });
  return mode;
};
const C_LINE_COMMENT_MODE = COMMENT('//', '$');
const C_BLOCK_COMMENT_MODE = COMMENT('/\\*', '\\*/');
const HASH_COMMENT_MODE = COMMENT('#', '$');
const NUMBER_MODE = {
  className: 'number',
  begin: NUMBER_RE,
  relevance: 0
};
const C_NUMBER_MODE = {
  className: 'number',
  begin: C_NUMBER_RE,
  relevance: 0
};
const BINARY_NUMBER_MODE = {
  className: 'number',
  begin: BINARY_NUMBER_RE,
  relevance: 0
};
const CSS_NUMBER_MODE = {
  className: 'number',
  begin: NUMBER_RE + '(' +
    '%|em|ex|ch|rem' +
    '|vw|vh|vmin|vmax' +
    '|cm|mm|in|pt|pc|px' +
    '|deg|grad|rad|turn' +
    '|s|ms' +
    '|Hz|kHz' +
    '|dpi|dpcm|dppx' +
    ')?',
  relevance: 0
};
const REGEXP_MODE = {
  // this outer rule makes sure we actually have a WHOLE regex and not simply
  // an expression such as:
  //
  //     3 / something
  //
  // (which will then blow up when regex's `illegal` sees the newline)
  begin: /(?=\/[^/\n]*\/)/,
  contains: [{
    className: 'regexp',
    begin: /\//,
    end: /\/[gimuy]*/,
    illegal: /\n/,
    contains: [
      BACKSLASH_ESCAPE,
      {
        begin: /\[/,
        end: /\]/,
        relevance: 0,
        contains: [BACKSLASH_ESCAPE]
      }
    ]
  }]
};
const TITLE_MODE = {
  className: 'title',
  begin: IDENT_RE,
  relevance: 0
};
const UNDERSCORE_TITLE_MODE = {
  className: 'title',
  begin: UNDERSCORE_IDENT_RE,
  relevance: 0
};
const METHOD_GUARD = {
  // excludes method names from keyword processing
  begin: '\\.\\s*' + UNDERSCORE_IDENT_RE,
  relevance: 0
};

/**
 * Adds end same as begin mechanics to a mode
 *
 * Your mode must include at least a single () match group as that first match
 * group is what is used for comparison
 * @param {Partial<Mode>} mode
 */
const END_SAME_AS_BEGIN = function(mode) {
  return Object.assign(mode,
    {
      /** @type {ModeCallback} */
      'on:begin': (m, resp) => { resp.data._beginMatch = m[1]; },
      /** @type {ModeCallback} */
      'on:end': (m, resp) => { if (resp.data._beginMatch !== m[1]) resp.ignoreMatch(); }
    });
};

var MODES = /*#__PURE__*/Object.freeze({
    __proto__: null,
    IDENT_RE: IDENT_RE,
    UNDERSCORE_IDENT_RE: UNDERSCORE_IDENT_RE,
    NUMBER_RE: NUMBER_RE,
    C_NUMBER_RE: C_NUMBER_RE,
    BINARY_NUMBER_RE: BINARY_NUMBER_RE,
    RE_STARTERS_RE: RE_STARTERS_RE,
    SHEBANG: SHEBANG,
    BACKSLASH_ESCAPE: BACKSLASH_ESCAPE,
    APOS_STRING_MODE: APOS_STRING_MODE,
    QUOTE_STRING_MODE: QUOTE_STRING_MODE,
    PHRASAL_WORDS_MODE: PHRASAL_WORDS_MODE,
    COMMENT: COMMENT,
    C_LINE_COMMENT_MODE: C_LINE_COMMENT_MODE,
    C_BLOCK_COMMENT_MODE: C_BLOCK_COMMENT_MODE,
    HASH_COMMENT_MODE: HASH_COMMENT_MODE,
    NUMBER_MODE: NUMBER_MODE,
    C_NUMBER_MODE: C_NUMBER_MODE,
    BINARY_NUMBER_MODE: BINARY_NUMBER_MODE,
    CSS_NUMBER_MODE: CSS_NUMBER_MODE,
    REGEXP_MODE: REGEXP_MODE,
    TITLE_MODE: TITLE_MODE,
    UNDERSCORE_TITLE_MODE: UNDERSCORE_TITLE_MODE,
    METHOD_GUARD: METHOD_GUARD,
    END_SAME_AS_BEGIN: END_SAME_AS_BEGIN
});

// Grammar extensions / plugins
// See: https://github.com/highlightjs/highlight.js/issues/2833

// Grammar extensions allow "syntactic sugar" to be added to the grammar modes
// without requiring any underlying changes to the compiler internals.

// `compileMatch` being the perfect small example of now allowing a grammar
// author to write `match` when they desire to match a single expression rather
// than being forced to use `begin`.  The extension then just moves `match` into
// `begin` when it runs.  Ie, no features have been added, but we've just made
// the experience of writing (and reading grammars) a little bit nicer.

// ------

// TODO: We need negative look-behind support to do this properly
/**
 * Skip a match if it has a preceding dot
 *
 * This is used for `beginKeywords` to prevent matching expressions such as
 * `bob.keyword.do()`. The mode compiler automatically wires this up as a
 * special _internal_ 'on:begin' callback for modes with `beginKeywords`
 * @param {RegExpMatchArray} match
 * @param {CallbackResponse} response
 */
function skipIfhasPrecedingDot(match, response) {
  const before = match.input[match.index - 1];
  if (before === ".") {
    response.ignoreMatch();
  }
}


/**
 * `beginKeywords` syntactic sugar
 * @type {CompilerExt}
 */
function beginKeywords(mode, parent) {
  if (!parent) return;
  if (!mode.beginKeywords) return;

  // for languages with keywords that include non-word characters checking for
  // a word boundary is not sufficient, so instead we check for a word boundary
  // or whitespace - this does no harm in any case since our keyword engine
  // doesn't allow spaces in keywords anyways and we still check for the boundary
  // first
  mode.begin = '\\b(' + mode.beginKeywords.split(' ').join('|') + ')(?!\\.)(?=\\b|\\s)';
  mode.__beforeBegin = skipIfhasPrecedingDot;
  mode.keywords = mode.keywords || mode.beginKeywords;
  delete mode.beginKeywords;
}

/**
 * Allow `illegal` to contain an array of illegal values
 * @type {CompilerExt}
 */
function compileIllegal(mode, _parent) {
  if (!Array.isArray(mode.illegal)) return;

  mode.illegal = either(...mode.illegal);
}

/**
 * `match` to match a single expression for readability
 * @type {CompilerExt}
 */
function compileMatch(mode, _parent) {
  if (!mode.match) return;
  if (mode.begin || mode.end) throw new Error("begin & end are not supported with match");

  mode.begin = mode.match;
  delete mode.match;
}

/**
 * provides the default 1 relevance to all modes
 * @type {CompilerExt}
 */
function compileRelevance(mode, _parent) {
  // eslint-disable-next-line no-undefined
  if (mode.relevance === undefined) mode.relevance = 1;
}

// keywords that should have no default relevance value
const COMMON_KEYWORDS = [
  'of',
  'and',
  'for',
  'in',
  'not',
  'or',
  'if',
  'then',
  'parent', // common variable name
  'list', // common variable name
  'value' // common variable name
];

/**
 * Given raw keywords from a language definition, compile them.
 *
 * @param {string | Record<string,string>} rawKeywords
 * @param {boolean} caseInsensitive
 */
function compileKeywords(rawKeywords, caseInsensitive) {
  /** @type KeywordDict */
  const compiledKeywords = {};

  if (typeof rawKeywords === 'string') { // string
    splitAndCompile('keyword', rawKeywords);
  } else {
    Object.keys(rawKeywords).forEach(function(className) {
      splitAndCompile(className, rawKeywords[className]);
    });
  }
  return compiledKeywords;

  // ---

  /**
   * Compiles an individual list of keywords
   *
   * Ex: "for if when while|5"
   *
   * @param {string} className
   * @param {string} keywordList
   */
  function splitAndCompile(className, keywordList) {
    if (caseInsensitive) {
      keywordList = keywordList.toLowerCase();
    }
    keywordList.split(' ').forEach(function(keyword) {
      const pair = keyword.split('|');
      compiledKeywords[pair[0]] = [className, scoreForKeyword(pair[0], pair[1])];
    });
  }
}

/**
 * Returns the proper score for a given keyword
 *
 * Also takes into account comment keywords, which will be scored 0 UNLESS
 * another score has been manually assigned.
 * @param {string} keyword
 * @param {string} [providedScore]
 */
function scoreForKeyword(keyword, providedScore) {
  // manual scores always win over common keywords
  // so you can force a score of 1 if you really insist
  if (providedScore) {
    return Number(providedScore);
  }

  return commonKeyword(keyword) ? 0 : 1;
}

/**
 * Determines if a given keyword is common or not
 *
 * @param {string} keyword */
function commonKeyword(keyword) {
  return COMMON_KEYWORDS.includes(keyword.toLowerCase());
}

// compilation

/**
 * Compiles a language definition result
 *
 * Given the raw result of a language definition (Language), compiles this so
 * that it is ready for highlighting code.
 * @param {Language} language
 * @param {{plugins: HLJSPlugin[]}} opts
 * @returns {CompiledLanguage}
 */
function compileLanguage(language, { plugins }) {
  /**
   * Builds a regex with the case sensativility of the current language
   *
   * @param {RegExp | string} value
   * @param {boolean} [global]
   */
  function langRe(value, global) {
    return new RegExp(
      source(value),
      'm' + (language.case_insensitive ? 'i' : '') + (global ? 'g' : '')
    );
  }

  /**
    Stores multiple regular expressions and allows you to quickly search for
    them all in a string simultaneously - returning the first match.  It does
    this by creating a huge (a|b|c) regex - each individual item wrapped with ()
    and joined by `|` - using match groups to track position.  When a match is
    found checking which position in the array has content allows us to figure
    out which of the original regexes / match groups triggered the match.

    The match object itself (the result of `Regex.exec`) is returned but also
    enhanced by merging in any meta-data that was registered with the regex.
    This is how we keep track of which mode matched, and what type of rule
    (`illegal`, `begin`, end, etc).
  */
  class MultiRegex {
    constructor() {
      this.matchIndexes = {};
      // @ts-ignore
      this.regexes = [];
      this.matchAt = 1;
      this.position = 0;
    }

    // @ts-ignore
    addRule(re, opts) {
      opts.position = this.position++;
      // @ts-ignore
      this.matchIndexes[this.matchAt] = opts;
      this.regexes.push([opts, re]);
      this.matchAt += countMatchGroups(re) + 1;
    }

    compile() {
      if (this.regexes.length === 0) {
        // avoids the need to check length every time exec is called
        // @ts-ignore
        this.exec = () => null;
      }
      const terminators = this.regexes.map(el => el[1]);
      this.matcherRe = langRe(join(terminators), true);
      this.lastIndex = 0;
    }

    /** @param {string} s */
    exec(s) {
      this.matcherRe.lastIndex = this.lastIndex;
      const match = this.matcherRe.exec(s);
      if (!match) { return null; }

      // eslint-disable-next-line no-undefined
      const i = match.findIndex((el, i) => i > 0 && el !== undefined);
      // @ts-ignore
      const matchData = this.matchIndexes[i];
      // trim off any earlier non-relevant match groups (ie, the other regex
      // match groups that make up the multi-matcher)
      match.splice(0, i);

      return Object.assign(match, matchData);
    }
  }

  /*
    Created to solve the key deficiently with MultiRegex - there is no way to
    test for multiple matches at a single location.  Why would we need to do
    that?  In the future a more dynamic engine will allow certain matches to be
    ignored.  An example: if we matched say the 3rd regex in a large group but
    decided to ignore it - we'd need to started testing again at the 4th
    regex... but MultiRegex itself gives us no real way to do that.

    So what this class creates MultiRegexs on the fly for whatever search
    position they are needed.

    NOTE: These additional MultiRegex objects are created dynamically.  For most
    grammars most of the time we will never actually need anything more than the
    first MultiRegex - so this shouldn't have too much overhead.

    Say this is our search group, and we match regex3, but wish to ignore it.

      regex1 | regex2 | regex3 | regex4 | regex5    ' ie, startAt = 0

    What we need is a new MultiRegex that only includes the remaining
    possibilities:

      regex4 | regex5                               ' ie, startAt = 3

    This class wraps all that complexity up in a simple API... `startAt` decides
    where in the array of expressions to start doing the matching. It
    auto-increments, so if a match is found at position 2, then startAt will be
    set to 3.  If the end is reached startAt will return to 0.

    MOST of the time the parser will be setting startAt manually to 0.
  */
  class ResumableMultiRegex {
    constructor() {
      // @ts-ignore
      this.rules = [];
      // @ts-ignore
      this.multiRegexes = [];
      this.count = 0;

      this.lastIndex = 0;
      this.regexIndex = 0;
    }

    // @ts-ignore
    getMatcher(index) {
      if (this.multiRegexes[index]) return this.multiRegexes[index];

      const matcher = new MultiRegex();
      this.rules.slice(index).forEach(([re, opts]) => matcher.addRule(re, opts));
      matcher.compile();
      this.multiRegexes[index] = matcher;
      return matcher;
    }

    resumingScanAtSamePosition() {
      return this.regexIndex !== 0;
    }

    considerAll() {
      this.regexIndex = 0;
    }

    // @ts-ignore
    addRule(re, opts) {
      this.rules.push([re, opts]);
      if (opts.type === "begin") this.count++;
    }

    /** @param {string} s */
    exec(s) {
      const m = this.getMatcher(this.regexIndex);
      m.lastIndex = this.lastIndex;
      let result = m.exec(s);

      // The following is because we have no easy way to say "resume scanning at the
      // existing position but also skip the current rule ONLY". What happens is
      // all prior rules are also skipped which can result in matching the wrong
      // thing. Example of matching "booger":

      // our matcher is [string, "booger", number]
      //
      // ....booger....

      // if "booger" is ignored then we'd really need a regex to scan from the
      // SAME position for only: [string, number] but ignoring "booger" (if it
      // was the first match), a simple resume would scan ahead who knows how
      // far looking only for "number", ignoring potential string matches (or
      // future "booger" matches that might be valid.)

      // So what we do: We execute two matchers, one resuming at the same
      // position, but the second full matcher starting at the position after:

      //     /--- resume first regex match here (for [number])
      //     |/---- full match here for [string, "booger", number]
      //     vv
      // ....booger....

      // Which ever results in a match first is then used. So this 3-4 step
      // process essentially allows us to say "match at this position, excluding
      // a prior rule that was ignored".
      //
      // 1. Match "booger" first, ignore. Also proves that [string] does non match.
      // 2. Resume matching for [number]
      // 3. Match at index + 1 for [string, "booger", number]
      // 4. If #2 and #3 result in matches, which came first?
      if (this.resumingScanAtSamePosition()) {
        if (result && result.index === this.lastIndex) ; else { // use the second matcher result
          const m2 = this.getMatcher(0);
          m2.lastIndex = this.lastIndex + 1;
          result = m2.exec(s);
        }
      }

      if (result) {
        this.regexIndex += result.position + 1;
        if (this.regexIndex === this.count) {
          // wrap-around to considering all matches again
          this.considerAll();
        }
      }

      return result;
    }
  }

  /**
   * Given a mode, builds a huge ResumableMultiRegex that can be used to walk
   * the content and find matches.
   *
   * @param {CompiledMode} mode
   * @returns {ResumableMultiRegex}
   */
  function buildModeRegex(mode) {
    const mm = new ResumableMultiRegex();

    mode.contains.forEach(term => mm.addRule(term.begin, { rule: term, type: "begin" }));

    if (mode.terminatorEnd) {
      mm.addRule(mode.terminatorEnd, { type: "end" });
    }
    if (mode.illegal) {
      mm.addRule(mode.illegal, { type: "illegal" });
    }

    return mm;
  }

  /** skip vs abort vs ignore
   *
   * @skip   - The mode is still entered and exited normally (and contains rules apply),
   *           but all content is held and added to the parent buffer rather than being
   *           output when the mode ends.  Mostly used with `sublanguage` to build up
   *           a single large buffer than can be parsed by sublanguage.
   *
   *             - The mode begin ands ends normally.
   *             - Content matched is added to the parent mode buffer.
   *             - The parser cursor is moved forward normally.
   *
   * @abort  - A hack placeholder until we have ignore.  Aborts the mode (as if it
   *           never matched) but DOES NOT continue to match subsequent `contains`
   *           modes.  Abort is bad/suboptimal because it can result in modes
   *           farther down not getting applied because an earlier rule eats the
   *           content but then aborts.
   *
   *             - The mode does not begin.
   *             - Content matched by `begin` is added to the mode buffer.
   *             - The parser cursor is moved forward accordingly.
   *
   * @ignore - Ignores the mode (as if it never matched) and continues to match any
   *           subsequent `contains` modes.  Ignore isn't technically possible with
   *           the current parser implementation.
   *
   *             - The mode does not begin.
   *             - Content matched by `begin` is ignored.
   *             - The parser cursor is not moved forward.
   */

  /**
   * Compiles an individual mode
   *
   * This can raise an error if the mode contains certain detectable known logic
   * issues.
   * @param {Mode} mode
   * @param {CompiledMode | null} [parent]
   * @returns {CompiledMode | never}
   */
  function compileMode(mode, parent) {
    const cmode = /** @type CompiledMode */ (mode);
    if (mode.compiled) return cmode;

    [
      // do this early so compiler extensions generally don't have to worry about
      // the distinction between match/begin
      compileMatch
    ].forEach(ext => ext(mode, parent));

    language.compilerExtensions.forEach(ext => ext(mode, parent));

    // __beforeBegin is considered private API, internal use only
    mode.__beforeBegin = null;

    [
      beginKeywords,
      // do this later so compiler extensions that come earlier have access to the
      // raw array if they wanted to perhaps manipulate it, etc.
      compileIllegal,
      // default to 1 relevance if not specified
      compileRelevance
    ].forEach(ext => ext(mode, parent));

    mode.compiled = true;

    let keywordPattern = null;
    if (typeof mode.keywords === "object") {
      keywordPattern = mode.keywords.$pattern;
      delete mode.keywords.$pattern;
    }

    if (mode.keywords) {
      mode.keywords = compileKeywords(mode.keywords, language.case_insensitive);
    }

    // both are not allowed
    if (mode.lexemes && keywordPattern) {
      throw new Error("ERR: Prefer `keywords.$pattern` to `mode.lexemes`, BOTH are not allowed. (see mode reference) ");
    }

    // `mode.lexemes` was the old standard before we added and now recommend
    // using `keywords.$pattern` to pass the keyword pattern
    keywordPattern = keywordPattern || mode.lexemes || /\w+/;
    cmode.keywordPatternRe = langRe(keywordPattern, true);

    if (parent) {
      if (!mode.begin) mode.begin = /\B|\b/;
      cmode.beginRe = langRe(mode.begin);
      if (mode.endSameAsBegin) mode.end = mode.begin;
      if (!mode.end && !mode.endsWithParent) mode.end = /\B|\b/;
      if (mode.end) cmode.endRe = langRe(mode.end);
      cmode.terminatorEnd = source(mode.end) || '';
      if (mode.endsWithParent && parent.terminatorEnd) {
        cmode.terminatorEnd += (mode.end ? '|' : '') + parent.terminatorEnd;
      }
    }
    if (mode.illegal) cmode.illegalRe = langRe(/** @type {RegExp | string} */ (mode.illegal));
    if (!mode.contains) mode.contains = [];

    mode.contains = [].concat(...mode.contains.map(function(c) {
      return expandOrCloneMode(c === 'self' ? mode : c);
    }));
    mode.contains.forEach(function(c) { compileMode(/** @type Mode */ (c), cmode); });

    if (mode.starts) {
      compileMode(mode.starts, parent);
    }

    cmode.matcher = buildModeRegex(cmode);
    return cmode;
  }

  if (!language.compilerExtensions) language.compilerExtensions = [];

  // self is not valid at the top-level
  if (language.contains && language.contains.includes('self')) {
    throw new Error("ERR: contains `self` is not supported at the top-level of a language.  See documentation.");
  }

  // we need a null object, which inherit will guarantee
  language.classNameAliases = inherit(language.classNameAliases || {});

  return compileMode(/** @type Mode */ (language));
}

/**
 * Determines if a mode has a dependency on it's parent or not
 *
 * If a mode does have a parent dependency then often we need to clone it if
 * it's used in multiple places so that each copy points to the correct parent,
 * where-as modes without a parent can often safely be re-used at the bottom of
 * a mode chain.
 *
 * @param {Mode | null} mode
 * @returns {boolean} - is there a dependency on the parent?
 * */
function dependencyOnParent(mode) {
  if (!mode) return false;

  return mode.endsWithParent || dependencyOnParent(mode.starts);
}

/**
 * Expands a mode or clones it if necessary
 *
 * This is necessary for modes with parental dependenceis (see notes on
 * `dependencyOnParent`) and for nodes that have `variants` - which must then be
 * exploded into their own individual modes at compile time.
 *
 * @param {Mode} mode
 * @returns {Mode | Mode[]}
 * */
function expandOrCloneMode(mode) {
  if (mode.variants && !mode.cachedVariants) {
    mode.cachedVariants = mode.variants.map(function(variant) {
      return inherit(mode, { variants: null }, variant);
    });
  }

  // EXPAND
  // if we have variants then essentially "replace" the mode with the variants
  // this happens in compileMode, where this function is called from
  if (mode.cachedVariants) {
    return mode.cachedVariants;
  }

  // CLONE
  // if we have dependencies on parents then we need a unique
  // instance of ourselves, so we can be reused with many
  // different parents without issue
  if (dependencyOnParent(mode)) {
    return inherit(mode, { starts: mode.starts ? inherit(mode.starts) : null });
  }

  if (Object.isFrozen(mode)) {
    return inherit(mode);
  }

  // no special dependency issues, just return ourselves
  return mode;
}

var version = "10.5.0";

// @ts-nocheck

function hasValueOrEmptyAttribute(value) {
  return Boolean(value || value === "");
}

function BuildVuePlugin(hljs) {
  const Component = {
    props: ["language", "code", "autodetect"],
    data: function() {
      return {
        detectedLanguage: "",
        unknownLanguage: false
      };
    },
    computed: {
      className() {
        if (this.unknownLanguage) return "";

        return "hljs " + this.detectedLanguage;
      },
      highlighted() {
        // no idea what language to use, return raw code
        if (!this.autoDetect && !hljs.getLanguage(this.language)) {
          console.warn(`The language "${this.language}" you specified could not be found.`);
          this.unknownLanguage = true;
          return escapeHTML(this.code);
        }

        let result = {};
        if (this.autoDetect) {
          result = hljs.highlightAuto(this.code);
          this.detectedLanguage = result.language;
        } else {
          result = hljs.highlight(this.language, this.code, this.ignoreIllegals);
          this.detectedLanguage = this.language;
        }
        return result.value;
      },
      autoDetect() {
        return !this.language || hasValueOrEmptyAttribute(this.autodetect);
      },
      ignoreIllegals() {
        return true;
      }
    },
    // this avoids needing to use a whole Vue compilation pipeline just
    // to build Highlight.js
    render(createElement) {
      return createElement("pre", {}, [
        createElement("code", {
          class: this.className,
          domProps: { innerHTML: this.highlighted }
        })
      ]);
    }
    // template: `<pre><code :class="className" v-html="highlighted"></code></pre>`
  };

  const VuePlugin = {
    install(Vue) {
      Vue.component('highlightjs', Component);
    }
  };

  return { Component, VuePlugin };
}

/* plugin itself */

/** @type {HLJSPlugin} */
const mergeHTMLPlugin = {
  "after:highlightBlock": ({ block, result, text }) => {
    const originalStream = nodeStream(block);
    if (!originalStream.length) return;

    const resultNode = document.createElement('div');
    resultNode.innerHTML = result.value;
    result.value = mergeStreams(originalStream, nodeStream(resultNode), text);
  }
};

/* Stream merging support functions */

/**
 * @typedef Event
 * @property {'start'|'stop'} event
 * @property {number} offset
 * @property {Node} node
 */

/**
 * @param {Node} node
 */
function tag(node) {
  return node.nodeName.toLowerCase();
}

/**
 * @param {Node} node
 */
function nodeStream(node) {
  /** @type Event[] */
  const result = [];
  (function _nodeStream(node, offset) {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3) {
        offset += child.nodeValue.length;
      } else if (child.nodeType === 1) {
        result.push({
          event: 'start',
          offset: offset,
          node: child
        });
        offset = _nodeStream(child, offset);
        // Prevent void elements from having an end tag that would actually
        // double them in the output. There are more void elements in HTML
        // but we list only those realistically expected in code display.
        if (!tag(child).match(/br|hr|img|input/)) {
          result.push({
            event: 'stop',
            offset: offset,
            node: child
          });
        }
      }
    }
    return offset;
  })(node, 0);
  return result;
}

/**
 * @param {any} original - the original stream
 * @param {any} highlighted - stream of the highlighted source
 * @param {string} value - the original source itself
 */
function mergeStreams(original, highlighted, value) {
  let processed = 0;
  let result = '';
  const nodeStack = [];

  function selectStream() {
    if (!original.length || !highlighted.length) {
      return original.length ? original : highlighted;
    }
    if (original[0].offset !== highlighted[0].offset) {
      return (original[0].offset < highlighted[0].offset) ? original : highlighted;
    }

    /*
    To avoid starting the stream just before it should stop the order is
    ensured that original always starts first and closes last:

    if (event1 == 'start' && event2 == 'start')
      return original;
    if (event1 == 'start' && event2 == 'stop')
      return highlighted;
    if (event1 == 'stop' && event2 == 'start')
      return original;
    if (event1 == 'stop' && event2 == 'stop')
      return highlighted;

    ... which is collapsed to:
    */
    return highlighted[0].event === 'start' ? original : highlighted;
  }

  /**
   * @param {Node} node
   */
  function open(node) {
    /** @param {Attr} attr */
    function attributeString(attr) {
      return ' ' + attr.nodeName + '="' + escapeHTML(attr.value) + '"';
    }
    // @ts-ignore
    result += '<' + tag(node) + [].map.call(node.attributes, attributeString).join('') + '>';
  }

  /**
   * @param {Node} node
   */
  function close(node) {
    result += '</' + tag(node) + '>';
  }

  /**
   * @param {Event} event
   */
  function render(event) {
    (event.event === 'start' ? open : close)(event.node);
  }

  while (original.length || highlighted.length) {
    let stream = selectStream();
    result += escapeHTML(value.substring(processed, stream[0].offset));
    processed = stream[0].offset;
    if (stream === original) {
      /*
      On any opening or closing tag of the original markup we first close
      the entire highlighted node stack, then render the original tag along
      with all the following original tags at the same offset and then
      reopen all the tags on the highlighted stack.
      */
      nodeStack.reverse().forEach(close);
      do {
        render(stream.splice(0, 1)[0]);
        stream = selectStream();
      } while (stream === original && stream.length && stream[0].offset === processed);
      nodeStack.reverse().forEach(open);
    } else {
      if (stream[0].event === 'start') {
        nodeStack.push(stream[0].node);
      } else {
        nodeStack.pop();
      }
      render(stream.splice(0, 1)[0]);
    }
  }
  return result + escapeHTML(value.substr(processed));
}

/*

For the reasoning behind this please see:
https://github.com/highlightjs/highlight.js/issues/2880#issuecomment-747275419

*/

/**
 * @param {string} message
 */
const error = (message) => {
  console.error(message);
};

/**
 * @param {string} message
 * @param {any} args
 */
const warn = (message, ...args) => {
  console.log(`WARN: ${message}`, ...args);
};

/**
 * @param {string} version
 * @param {string} message
 */
const deprecated = (version, message) => {
  console.log(`Deprecated as of ${version}. ${message}`);
};

/*
Syntax highlighting with language autodetection.
https://highlightjs.org/
*/

const escape$1 = escapeHTML;
const inherit$1 = inherit;
const NO_MATCH = Symbol("nomatch");

/**
 * @param {any} hljs - object that is extended (legacy)
 * @returns {HLJSApi}
 */
const HLJS = function(hljs) {
  // Global internal variables used within the highlight.js library.
  /** @type {Record<string, Language>} */
  const languages = Object.create(null);
  /** @type {Record<string, string>} */
  const aliases = Object.create(null);
  /** @type {HLJSPlugin[]} */
  const plugins = [];

  // safe/production mode - swallows more errors, tries to keep running
  // even if a single syntax or parse hits a fatal error
  let SAFE_MODE = true;
  const fixMarkupRe = /(^(<[^>]+>|\t|)+|\n)/gm;
  const LANGUAGE_NOT_FOUND = "Could not find the language '{}', did you forget to load/include a language module?";
  /** @type {Language} */
  const PLAINTEXT_LANGUAGE = { disableAutodetect: true, name: 'Plain text', contains: [] };

  // Global options used when within external APIs. This is modified when
  // calling the `hljs.configure` function.
  /** @type HLJSOptions */
  let options = {
    noHighlightRe: /^(no-?highlight)$/i,
    languageDetectRe: /\blang(?:uage)?-([\w-]+)\b/i,
    classPrefix: 'hljs-',
    tabReplace: null,
    useBR: false,
    languages: null,
    // beta configuration options, subject to change, welcome to discuss
    // https://github.com/highlightjs/highlight.js/issues/1086
    __emitter: TokenTreeEmitter
  };

  /* Utility functions */

  /**
   * Tests a language name to see if highlighting should be skipped
   * @param {string} languageName
   */
  function shouldNotHighlight(languageName) {
    return options.noHighlightRe.test(languageName);
  }

  /**
   * @param {HighlightedHTMLElement} block - the HTML element to determine language for
   */
  function blockLanguage(block) {
    let classes = block.className + ' ';

    classes += block.parentNode ? block.parentNode.className : '';

    // language-* takes precedence over non-prefixed class names.
    const match = options.languageDetectRe.exec(classes);
    if (match) {
      const language = getLanguage(match[1]);
      if (!language) {
        warn(LANGUAGE_NOT_FOUND.replace("{}", match[1]));
        warn("Falling back to no-highlight mode for this block.", block);
      }
      return language ? match[1] : 'no-highlight';
    }

    return classes
      .split(/\s+/)
      .find((_class) => shouldNotHighlight(_class) || getLanguage(_class));
  }

  /**
   * Core highlighting function.
   *
   * @param {string} languageName - the language to use for highlighting
   * @param {string} code - the code to highlight
   * @param {boolean} [ignoreIllegals] - whether to ignore illegal matches, default is to bail
   * @param {CompiledMode} [continuation] - current continuation mode, if any
   *
   * @returns {HighlightResult} Result - an object that represents the result
   * @property {string} language - the language name
   * @property {number} relevance - the relevance score
   * @property {string} value - the highlighted HTML code
   * @property {string} code - the original raw code
   * @property {CompiledMode} top - top of the current mode stack
   * @property {boolean} illegal - indicates whether any illegal matches were found
  */
  function highlight(languageName, code, ignoreIllegals, continuation) {
    /** @type {BeforeHighlightContext} */
    const context = {
      code,
      language: languageName
    };
    // the plugin can change the desired language or the code to be highlighted
    // just be changing the object it was passed
    fire("before:highlight", context);

    // a before plugin can usurp the result completely by providing it's own
    // in which case we don't even need to call highlight
    const result = context.result ?
      context.result :
      _highlight(context.language, context.code, ignoreIllegals, continuation);

    result.code = context.code;
    // the plugin can change anything in result to suite it
    fire("after:highlight", result);

    return result;
  }

  /**
   * private highlight that's used internally and does not fire callbacks
   *
   * @param {string} languageName - the language to use for highlighting
   * @param {string} code - the code to highlight
   * @param {boolean} [ignoreIllegals] - whether to ignore illegal matches, default is to bail
   * @param {CompiledMode} [continuation] - current continuation mode, if any
   * @returns {HighlightResult} - result of the highlight operation
  */
  function _highlight(languageName, code, ignoreIllegals, continuation) {
    const codeToHighlight = code;

    /**
     * Return keyword data if a match is a keyword
     * @param {CompiledMode} mode - current mode
     * @param {RegExpMatchArray} match - regexp match data
     * @returns {KeywordData | false}
     */
    function keywordData(mode, match) {
      const matchText = language.case_insensitive ? match[0].toLowerCase() : match[0];
      return Object.prototype.hasOwnProperty.call(mode.keywords, matchText) && mode.keywords[matchText];
    }

    function processKeywords() {
      if (!top.keywords) {
        emitter.addText(modeBuffer);
        return;
      }

      let lastIndex = 0;
      top.keywordPatternRe.lastIndex = 0;
      let match = top.keywordPatternRe.exec(modeBuffer);
      let buf = "";

      while (match) {
        buf += modeBuffer.substring(lastIndex, match.index);
        const data = keywordData(top, match);
        if (data) {
          const [kind, keywordRelevance] = data;
          emitter.addText(buf);
          buf = "";

          relevance += keywordRelevance;
          const cssClass = language.classNameAliases[kind] || kind;
          emitter.addKeyword(match[0], cssClass);
        } else {
          buf += match[0];
        }
        lastIndex = top.keywordPatternRe.lastIndex;
        match = top.keywordPatternRe.exec(modeBuffer);
      }
      buf += modeBuffer.substr(lastIndex);
      emitter.addText(buf);
    }

    function processSubLanguage() {
      if (modeBuffer === "") return;
      /** @type HighlightResult */
      let result = null;

      if (typeof top.subLanguage === 'string') {
        if (!languages[top.subLanguage]) {
          emitter.addText(modeBuffer);
          return;
        }
        result = _highlight(top.subLanguage, modeBuffer, true, continuations[top.subLanguage]);
        continuations[top.subLanguage] = /** @type {CompiledMode} */ (result.top);
      } else {
        result = highlightAuto(modeBuffer, top.subLanguage.length ? top.subLanguage : null);
      }

      // Counting embedded language score towards the host language may be disabled
      // with zeroing the containing mode relevance. Use case in point is Markdown that
      // allows XML everywhere and makes every XML snippet to have a much larger Markdown
      // score.
      if (top.relevance > 0) {
        relevance += result.relevance;
      }
      emitter.addSublanguage(result.emitter, result.language);
    }

    function processBuffer() {
      if (top.subLanguage != null) {
        processSubLanguage();
      } else {
        processKeywords();
      }
      modeBuffer = '';
    }

    /**
     * @param {Mode} mode - new mode to start
     */
    function startNewMode(mode) {
      if (mode.className) {
        emitter.openNode(language.classNameAliases[mode.className] || mode.className);
      }
      top = Object.create(mode, { parent: { value: top } });
      return top;
    }

    /**
     * @param {CompiledMode } mode - the mode to potentially end
     * @param {RegExpMatchArray} match - the latest match
     * @param {string} matchPlusRemainder - match plus remainder of content
     * @returns {CompiledMode | void} - the next mode, or if void continue on in current mode
     */
    function endOfMode(mode, match, matchPlusRemainder) {
      let matched = startsWith(mode.endRe, matchPlusRemainder);

      if (matched) {
        if (mode["on:end"]) {
          const resp = new Response(mode);
          mode["on:end"](match, resp);
          if (resp.ignore) matched = false;
        }

        if (matched) {
          while (mode.endsParent && mode.parent) {
            mode = mode.parent;
          }
          return mode;
        }
      }
      // even if on:end fires an `ignore` it's still possible
      // that we might trigger the end node because of a parent mode
      if (mode.endsWithParent) {
        return endOfMode(mode.parent, match, matchPlusRemainder);
      }
    }

    /**
     * Handle matching but then ignoring a sequence of text
     *
     * @param {string} lexeme - string containing full match text
     */
    function doIgnore(lexeme) {
      if (top.matcher.regexIndex === 0) {
        // no more regexs to potentially match here, so we move the cursor forward one
        // space
        modeBuffer += lexeme[0];
        return 1;
      } else {
        // no need to move the cursor, we still have additional regexes to try and
        // match at this very spot
        resumeScanAtSamePosition = true;
        return 0;
      }
    }

    /**
     * Handle the start of a new potential mode match
     *
     * @param {EnhancedMatch} match - the current match
     * @returns {number} how far to advance the parse cursor
     */
    function doBeginMatch(match) {
      const lexeme = match[0];
      const newMode = match.rule;

      const resp = new Response(newMode);
      // first internal before callbacks, then the public ones
      const beforeCallbacks = [newMode.__beforeBegin, newMode["on:begin"]];
      for (const cb of beforeCallbacks) {
        if (!cb) continue;
        cb(match, resp);
        if (resp.ignore) return doIgnore(lexeme);
      }

      if (newMode && newMode.endSameAsBegin) {
        newMode.endRe = escape(lexeme);
      }

      if (newMode.skip) {
        modeBuffer += lexeme;
      } else {
        if (newMode.excludeBegin) {
          modeBuffer += lexeme;
        }
        processBuffer();
        if (!newMode.returnBegin && !newMode.excludeBegin) {
          modeBuffer = lexeme;
        }
      }
      startNewMode(newMode);
      // if (mode["after:begin"]) {
      //   let resp = new Response(mode);
      //   mode["after:begin"](match, resp);
      // }
      return newMode.returnBegin ? 0 : lexeme.length;
    }

    /**
     * Handle the potential end of mode
     *
     * @param {RegExpMatchArray} match - the current match
     */
    function doEndMatch(match) {
      const lexeme = match[0];
      const matchPlusRemainder = codeToHighlight.substr(match.index);

      const endMode = endOfMode(top, match, matchPlusRemainder);
      if (!endMode) { return NO_MATCH; }

      const origin = top;
      if (origin.skip) {
        modeBuffer += lexeme;
      } else {
        if (!(origin.returnEnd || origin.excludeEnd)) {
          modeBuffer += lexeme;
        }
        processBuffer();
        if (origin.excludeEnd) {
          modeBuffer = lexeme;
        }
      }
      do {
        if (top.className) {
          emitter.closeNode();
        }
        if (!top.skip && !top.subLanguage) {
          relevance += top.relevance;
        }
        top = top.parent;
      } while (top !== endMode.parent);
      if (endMode.starts) {
        if (endMode.endSameAsBegin) {
          endMode.starts.endRe = endMode.endRe;
        }
        startNewMode(endMode.starts);
      }
      return origin.returnEnd ? 0 : lexeme.length;
    }

    function processContinuations() {
      const list = [];
      for (let current = top; current !== language; current = current.parent) {
        if (current.className) {
          list.unshift(current.className);
        }
      }
      list.forEach(item => emitter.openNode(item));
    }

    /** @type {{type?: MatchType, index?: number, rule?: Mode}}} */
    let lastMatch = {};

    /**
     *  Process an individual match
     *
     * @param {string} textBeforeMatch - text preceeding the match (since the last match)
     * @param {EnhancedMatch} [match] - the match itself
     */
    function processLexeme(textBeforeMatch, match) {
      const lexeme = match && match[0];

      // add non-matched text to the current mode buffer
      modeBuffer += textBeforeMatch;

      if (lexeme == null) {
        processBuffer();
        return 0;
      }

      // we've found a 0 width match and we're stuck, so we need to advance
      // this happens when we have badly behaved rules that have optional matchers to the degree that
      // sometimes they can end up matching nothing at all
      // Ref: https://github.com/highlightjs/highlight.js/issues/2140
      if (lastMatch.type === "begin" && match.type === "end" && lastMatch.index === match.index && lexeme === "") {
        // spit the "skipped" character that our regex choked on back into the output sequence
        modeBuffer += codeToHighlight.slice(match.index, match.index + 1);
        if (!SAFE_MODE) {
          /** @type {AnnotatedError} */
          const err = new Error('0 width match regex');
          err.languageName = languageName;
          err.badRule = lastMatch.rule;
          throw err;
        }
        return 1;
      }
      lastMatch = match;

      if (match.type === "begin") {
        return doBeginMatch(match);
      } else if (match.type === "illegal" && !ignoreIllegals) {
        // illegal match, we do not continue processing
        /** @type {AnnotatedError} */
        const err = new Error('Illegal lexeme "' + lexeme + '" for mode "' + (top.className || '<unnamed>') + '"');
        err.mode = top;
        throw err;
      } else if (match.type === "end") {
        const processed = doEndMatch(match);
        if (processed !== NO_MATCH) {
          return processed;
        }
      }

      // edge case for when illegal matches $ (end of line) which is technically
      // a 0 width match but not a begin/end match so it's not caught by the
      // first handler (when ignoreIllegals is true)
      if (match.type === "illegal" && lexeme === "") {
        // advance so we aren't stuck in an infinite loop
        return 1;
      }

      // infinite loops are BAD, this is a last ditch catch all. if we have a
      // decent number of iterations yet our index (cursor position in our
      // parsing) still 3x behind our index then something is very wrong
      // so we bail
      if (iterations > 100000 && iterations > match.index * 3) {
        const err = new Error('potential infinite loop, way more iterations than matches');
        throw err;
      }

      /*
      Why might be find ourselves here?  Only one occasion now.  An end match that was
      triggered but could not be completed.  When might this happen?  When an `endSameasBegin`
      rule sets the end rule to a specific match.  Since the overall mode termination rule that's
      being used to scan the text isn't recompiled that means that any match that LOOKS like
      the end (but is not, because it is not an exact match to the beginning) will
      end up here.  A definite end match, but when `doEndMatch` tries to "reapply"
      the end rule and fails to match, we wind up here, and just silently ignore the end.

      This causes no real harm other than stopping a few times too many.
      */

      modeBuffer += lexeme;
      return lexeme.length;
    }

    const language = getLanguage(languageName);
    if (!language) {
      error(LANGUAGE_NOT_FOUND.replace("{}", languageName));
      throw new Error('Unknown language: "' + languageName + '"');
    }

    const md = compileLanguage(language, { plugins });
    let result = '';
    /** @type {CompiledMode} */
    let top = continuation || md;
    /** @type Record<string,CompiledMode> */
    const continuations = {}; // keep continuations for sub-languages
    const emitter = new options.__emitter(options);
    processContinuations();
    let modeBuffer = '';
    let relevance = 0;
    let index = 0;
    let iterations = 0;
    let resumeScanAtSamePosition = false;

    try {
      top.matcher.considerAll();

      for (;;) {
        iterations++;
        if (resumeScanAtSamePosition) {
          // only regexes not matched previously will now be
          // considered for a potential match
          resumeScanAtSamePosition = false;
        } else {
          top.matcher.considerAll();
        }
        top.matcher.lastIndex = index;

        const match = top.matcher.exec(codeToHighlight);
        // console.log("match", match[0], match.rule && match.rule.begin)

        if (!match) break;

        const beforeMatch = codeToHighlight.substring(index, match.index);
        const processedCount = processLexeme(beforeMatch, match);
        index = match.index + processedCount;
      }
      processLexeme(codeToHighlight.substr(index));
      emitter.closeAllNodes();
      emitter.finalize();
      result = emitter.toHTML();

      return {
        relevance: relevance,
        value: result,
        language: languageName,
        illegal: false,
        emitter: emitter,
        top: top
      };
    } catch (err) {
      if (err.message && err.message.includes('Illegal')) {
        return {
          illegal: true,
          illegalBy: {
            msg: err.message,
            context: codeToHighlight.slice(index - 100, index + 100),
            mode: err.mode
          },
          sofar: result,
          relevance: 0,
          value: escape$1(codeToHighlight),
          emitter: emitter
        };
      } else if (SAFE_MODE) {
        return {
          illegal: false,
          relevance: 0,
          value: escape$1(codeToHighlight),
          emitter: emitter,
          language: languageName,
          top: top,
          errorRaised: err
        };
      } else {
        throw err;
      }
    }
  }

  /**
   * returns a valid highlight result, without actually doing any actual work,
   * auto highlight starts with this and it's possible for small snippets that
   * auto-detection may not find a better match
   * @param {string} code
   * @returns {HighlightResult}
   */
  function justTextHighlightResult(code) {
    const result = {
      relevance: 0,
      emitter: new options.__emitter(options),
      value: escape$1(code),
      illegal: false,
      top: PLAINTEXT_LANGUAGE
    };
    result.emitter.addText(code);
    return result;
  }

  /**
  Highlighting with language detection. Accepts a string with the code to
  highlight. Returns an object with the following properties:

  - language (detected language)
  - relevance (int)
  - value (an HTML string with highlighting markup)
  - second_best (object with the same structure for second-best heuristically
    detected language, may be absent)

    @param {string} code
    @param {Array<string>} [languageSubset]
    @returns {AutoHighlightResult}
  */
  function highlightAuto(code, languageSubset) {
    languageSubset = languageSubset || options.languages || Object.keys(languages);
    const plaintext = justTextHighlightResult(code);

    const results = languageSubset.filter(getLanguage).filter(autoDetection).map(name =>
      _highlight(name, code, false)
    );
    results.unshift(plaintext); // plaintext is always an option

    const sorted = results.sort((a, b) => {
      // sort base on relevance
      if (a.relevance !== b.relevance) return b.relevance - a.relevance;

      // always award the tie to the base language
      // ie if C++ and Arduino are tied, it's more likely to be C++
      if (a.language && b.language) {
        if (getLanguage(a.language).supersetOf === b.language) {
          return 1;
        } else if (getLanguage(b.language).supersetOf === a.language) {
          return -1;
        }
      }

      // otherwise say they are equal, which has the effect of sorting on
      // relevance while preserving the original ordering - which is how ties
      // have historically been settled, ie the language that comes first always
      // wins in the case of a tie
      return 0;
    });

    const [best, secondBest] = sorted;

    /** @type {AutoHighlightResult} */
    const result = best;
    result.second_best = secondBest;

    return result;
  }

  /**
  Post-processing of the highlighted markup:

  - replace TABs with something more useful
  - replace real line-breaks with '<br>' for non-pre containers

    @param {string} html
    @returns {string}
  */
  function fixMarkup(html) {
    if (!(options.tabReplace || options.useBR)) {
      return html;
    }

    return html.replace(fixMarkupRe, match => {
      if (match === '\n') {
        return options.useBR ? '<br>' : match;
      } else if (options.tabReplace) {
        return match.replace(/\t/g, options.tabReplace);
      }
      return match;
    });
  }

  /**
   * Builds new class name for block given the language name
   *
   * @param {HTMLElement} element
   * @param {string} [currentLang]
   * @param {string} [resultLang]
   */
  function updateClassName(element, currentLang, resultLang) {
    const language = currentLang ? aliases[currentLang] : resultLang;

    element.classList.add("hljs");
    if (language) element.classList.add(language);
  }

  /** @type {HLJSPlugin} */
  const brPlugin = {
    "before:highlightBlock": ({ block }) => {
      if (options.useBR) {
        block.innerHTML = block.innerHTML.replace(/\n/g, '').replace(/<br[ /]*>/g, '\n');
      }
    },
    "after:highlightBlock": ({ result }) => {
      if (options.useBR) {
        result.value = result.value.replace(/\n/g, "<br>");
      }
    }
  };

  const TAB_REPLACE_RE = /^(<[^>]+>|\t)+/gm;
  /** @type {HLJSPlugin} */
  const tabReplacePlugin = {
    "after:highlightBlock": ({ result }) => {
      if (options.tabReplace) {
        result.value = result.value.replace(TAB_REPLACE_RE, (m) =>
          m.replace(/\t/g, options.tabReplace)
        );
      }
    }
  };

  /**
   * Applies highlighting to a DOM node containing code. Accepts a DOM node and
   * two optional parameters for fixMarkup.
   *
   * @param {HighlightedHTMLElement} element - the HTML element to highlight
  */
  function highlightBlock(element) {
    /** @type HTMLElement */
    let node = null;
    const language = blockLanguage(element);

    if (shouldNotHighlight(language)) return;

    fire("before:highlightBlock",
      { block: element, language: language });

    node = element;
    const text = node.textContent;
    const result = language ? highlight(language, text, true) : highlightAuto(text);

    fire("after:highlightBlock", { block: element, result, text });

    element.innerHTML = result.value;
    updateClassName(element, language, result.language);
    element.result = {
      language: result.language,
      // TODO: remove with version 11.0
      re: result.relevance,
      relavance: result.relevance
    };
    if (result.second_best) {
      element.second_best = {
        language: result.second_best.language,
        // TODO: remove with version 11.0
        re: result.second_best.relevance,
        relavance: result.second_best.relevance
      };
    }
  }

  /**
   * Updates highlight.js global options with the passed options
   *
   * @param {Partial<HLJSOptions>} userOptions
   */
  function configure(userOptions) {
    if (userOptions.useBR) {
      deprecated("10.3.0", "'useBR' will be removed entirely in v11.0");
      deprecated("10.3.0", "Please see https://github.com/highlightjs/highlight.js/issues/2559");
    }
    options = inherit$1(options, userOptions);
  }

  /**
   * Highlights to all <pre><code> blocks on a page
   *
   * @type {Function & {called?: boolean}}
   */
  const initHighlighting = () => {
    if (initHighlighting.called) return;
    initHighlighting.called = true;

    const blocks = document.querySelectorAll('pre code');
    blocks.forEach(highlightBlock);
  };

  // Higlights all when DOMContentLoaded fires
  function initHighlightingOnLoad() {
    // @ts-ignore
    window.addEventListener('DOMContentLoaded', initHighlighting, false);
  }

  /**
   * Register a language grammar module
   *
   * @param {string} languageName
   * @param {LanguageFn} languageDefinition
   */
  function registerLanguage(languageName, languageDefinition) {
    let lang = null;
    try {
      lang = languageDefinition(hljs);
    } catch (error$1) {
      error("Language definition for '{}' could not be registered.".replace("{}", languageName));
      // hard or soft error
      if (!SAFE_MODE) { throw error$1; } else { error(error$1); }
      // languages that have serious errors are replaced with essentially a
      // "plaintext" stand-in so that the code blocks will still get normal
      // css classes applied to them - and one bad language won't break the
      // entire highlighter
      lang = PLAINTEXT_LANGUAGE;
    }
    // give it a temporary name if it doesn't have one in the meta-data
    if (!lang.name) lang.name = languageName;
    languages[languageName] = lang;
    lang.rawDefinition = languageDefinition.bind(null, hljs);

    if (lang.aliases) {
      registerAliases(lang.aliases, { languageName });
    }
  }

  /**
   * @returns {string[]} List of language internal names
   */
  function listLanguages() {
    return Object.keys(languages);
  }

  /**
    intended usage: When one language truly requires another

    Unlike `getLanguage`, this will throw when the requested language
    is not available.

    @param {string} name - name of the language to fetch/require
    @returns {Language | never}
  */
  function requireLanguage(name) {
    deprecated("10.4.0", "requireLanguage will be removed entirely in v11.");
    deprecated("10.4.0", "Please see https://github.com/highlightjs/highlight.js/pull/2844");

    const lang = getLanguage(name);
    if (lang) { return lang; }

    const err = new Error('The \'{}\' language is required, but not loaded.'.replace('{}', name));
    throw err;
  }

  /**
   * @param {string} name - name of the language to retrieve
   * @returns {Language | undefined}
   */
  function getLanguage(name) {
    name = (name || '').toLowerCase();
    return languages[name] || languages[aliases[name]];
  }

  /**
   *
   * @param {string|string[]} aliasList - single alias or list of aliases
   * @param {{languageName: string}} opts
   */
  function registerAliases(aliasList, { languageName }) {
    if (typeof aliasList === 'string') {
      aliasList = [aliasList];
    }
    aliasList.forEach(alias => { aliases[alias] = languageName; });
  }

  /**
   * Determines if a given language has auto-detection enabled
   * @param {string} name - name of the language
   */
  function autoDetection(name) {
    const lang = getLanguage(name);
    return lang && !lang.disableAutodetect;
  }

  /**
   * @param {HLJSPlugin} plugin
   */
  function addPlugin(plugin) {
    plugins.push(plugin);
  }

  /**
   *
   * @param {PluginEvent} event
   * @param {any} args
   */
  function fire(event, args) {
    const cb = event;
    plugins.forEach(function(plugin) {
      if (plugin[cb]) {
        plugin[cb](args);
      }
    });
  }

  /**
  Note: fixMarkup is deprecated and will be removed entirely in v11

  @param {string} arg
  @returns {string}
  */
  function deprecateFixMarkup(arg) {
    deprecated("10.2.0", "fixMarkup will be removed entirely in v11.0");
    deprecated("10.2.0", "Please see https://github.com/highlightjs/highlight.js/issues/2534");

    return fixMarkup(arg);
  }

  /* Interface definition */
  Object.assign(hljs, {
    highlight,
    highlightAuto,
    fixMarkup: deprecateFixMarkup,
    highlightBlock,
    configure,
    initHighlighting,
    initHighlightingOnLoad,
    registerLanguage,
    listLanguages,
    getLanguage,
    registerAliases,
    requireLanguage,
    autoDetection,
    inherit: inherit$1,
    addPlugin,
    // plugins for frameworks
    vuePlugin: BuildVuePlugin(hljs).VuePlugin
  });

  hljs.debugMode = function() { SAFE_MODE = false; };
  hljs.safeMode = function() { SAFE_MODE = true; };
  hljs.versionString = version;

  for (const key in MODES) {
    // @ts-ignore
    if (typeof MODES[key] === "object") {
      // @ts-ignore
      deepFreezeEs6(MODES[key]);
    }
  }

  // merge all the modes/regexs into our main object
  Object.assign(hljs, MODES);

  // built-in plugins, likely to be moved out of core in the future
  hljs.addPlugin(brPlugin); // slated to be removed in v11
  hljs.addPlugin(mergeHTMLPlugin);
  hljs.addPlugin(tabReplacePlugin);
  return hljs;
};

// export an "instance" of the highlighter
var highlight = HLJS({});

module.exports = highlight;

})();
(()=>{window.module={ set exports(fn) { hljs.registerLanguage('typescript', fn); } };
const IDENT_RE = '[A-Za-z$_][0-9A-Za-z$_]*';
const KEYWORDS = [
  "as", // for exports
  "in",
  "of",
  "if",
  "for",
  "while",
  "finally",
  "var",
  "new",
  "function",
  "do",
  "return",
  "void",
  "else",
  "break",
  "catch",
  "instanceof",
  "with",
  "throw",
  "case",
  "default",
  "try",
  "switch",
  "continue",
  "typeof",
  "delete",
  "let",
  "yield",
  "const",
  "class",
  // JS handles these with a special rule
  // "get",
  // "set",
  "debugger",
  "async",
  "await",
  "static",
  "import",
  "from",
  "export",
  "extends"
];
const LITERALS = [
  "true",
  "false",
  "null",
  "undefined",
  "NaN",
  "Infinity"
];

const TYPES = [
  "Intl",
  "DataView",
  "Number",
  "Math",
  "Date",
  "String",
  "RegExp",
  "Object",
  "Function",
  "Boolean",
  "Error",
  "Symbol",
  "Set",
  "Map",
  "WeakSet",
  "WeakMap",
  "Proxy",
  "Reflect",
  "JSON",
  "Promise",
  "Float64Array",
  "Int16Array",
  "Int32Array",
  "Int8Array",
  "Uint16Array",
  "Uint32Array",
  "Float32Array",
  "Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "ArrayBuffer"
];

const ERROR_TYPES = [
  "EvalError",
  "InternalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError"
];

const BUILT_IN_GLOBALS = [
  "setInterval",
  "setTimeout",
  "clearInterval",
  "clearTimeout",

  "require",
  "exports",

  "eval",
  "isFinite",
  "isNaN",
  "parseFloat",
  "parseInt",
  "decodeURI",
  "decodeURIComponent",
  "encodeURI",
  "encodeURIComponent",
  "escape",
  "unescape"
];

const BUILT_IN_VARIABLES = [
  "arguments",
  "this",
  "super",
  "console",
  "window",
  "document",
  "localStorage",
  "module",
  "global" // Node.js
];

const BUILT_INS = [].concat(
  BUILT_IN_GLOBALS,
  BUILT_IN_VARIABLES,
  TYPES,
  ERROR_TYPES
);

/**
 * @param {string} value
 * @returns {RegExp}
 * */

/**
 * @param {RegExp | string } re
 * @returns {string}
 */
function source(re) {
  if (!re) return null;
  if (typeof re === "string") return re;

  return re.source;
}

/**
 * @param {RegExp | string } re
 * @returns {string}
 */
function lookahead(re) {
  return concat('(?=', re, ')');
}

/**
 * @param {...(RegExp | string) } args
 * @returns {string}
 */
function concat(...args) {
  const joined = args.map((x) => source(x)).join("");
  return joined;
}

/*
Language: JavaScript
Description: JavaScript (JS) is a lightweight, interpreted, or just-in-time compiled programming language with first-class functions.
Category: common, scripting
Website: https://developer.mozilla.org/en-US/docs/Web/JavaScript
*/

/** @type LanguageFn */
function javascript(hljs) {
  /**
   * Takes a string like "<Booger" and checks to see
   * if we can find a matching "</Booger" later in the
   * content.
   * @param {RegExpMatchArray} match
   * @param {{after:number}} param1
   */
  const hasClosingTag = (match, { after }) => {
    const tag = "</" + match[0].slice(1);
    const pos = match.input.indexOf(tag, after);
    return pos !== -1;
  };

  const IDENT_RE$1 = IDENT_RE;
  const FRAGMENT = {
    begin: '<>',
    end: '</>'
  };
  const XML_TAG = {
    begin: /<[A-Za-z0-9\\._:-]+/,
    end: /\/[A-Za-z0-9\\._:-]+>|\/>/,
    /**
     * @param {RegExpMatchArray} match
     * @param {CallbackResponse} response
     */
    isTrulyOpeningTag: (match, response) => {
      const afterMatchIndex = match[0].length + match.index;
      const nextChar = match.input[afterMatchIndex];
      // nested type?
      // HTML should not include another raw `<` inside a tag
      // But a type might: `<Array<Array<number>>`, etc.
      if (nextChar === "<") {
        response.ignoreMatch();
        return;
      }
      // <something>
      // This is now either a tag or a type.
      if (nextChar === ">") {
        // if we cannot find a matching closing tag, then we
        // will ignore it
        if (!hasClosingTag(match, { after: afterMatchIndex })) {
          response.ignoreMatch();
        }
      }
    }
  };
  const KEYWORDS$1 = {
    $pattern: IDENT_RE,
    keyword: KEYWORDS.join(" "),
    literal: LITERALS.join(" "),
    built_in: BUILT_INS.join(" ")
  };

  // https://tc39.es/ecma262/#sec-literals-numeric-literals
  const decimalDigits = '[0-9](_?[0-9])*';
  const frac = `\\.(${decimalDigits})`;
  // DecimalIntegerLiteral, including Annex B NonOctalDecimalIntegerLiteral
  // https://tc39.es/ecma262/#sec-additional-syntax-numeric-literals
  const decimalInteger = `0|[1-9](_?[0-9])*|0[0-7]*[89][0-9]*`;
  const NUMBER = {
    className: 'number',
    variants: [
      // DecimalLiteral
      { begin: `(\\b(${decimalInteger})((${frac})|\\.)?|(${frac}))` +
        `[eE][+-]?(${decimalDigits})\\b` },
      { begin: `\\b(${decimalInteger})\\b((${frac})\\b|\\.)?|(${frac})\\b` },

      // DecimalBigIntegerLiteral
      { begin: `\\b(0|[1-9](_?[0-9])*)n\\b` },

      // NonDecimalIntegerLiteral
      { begin: "\\b0[xX][0-9a-fA-F](_?[0-9a-fA-F])*n?\\b" },
      { begin: "\\b0[bB][0-1](_?[0-1])*n?\\b" },
      { begin: "\\b0[oO][0-7](_?[0-7])*n?\\b" },

      // LegacyOctalIntegerLiteral (does not include underscore separators)
      // https://tc39.es/ecma262/#sec-additional-syntax-numeric-literals
      { begin: "\\b0[0-7]+n?\\b" },
    ],
    relevance: 0
  };

  const SUBST = {
    className: 'subst',
    begin: '\\$\\{',
    end: '\\}',
    keywords: KEYWORDS$1,
    contains: [] // defined later
  };
  const HTML_TEMPLATE = {
    begin: 'html`',
    end: '',
    starts: {
      end: '`',
      returnEnd: false,
      contains: [
        hljs.BACKSLASH_ESCAPE,
        SUBST
      ],
      subLanguage: 'xml'
    }
  };
  const CSS_TEMPLATE = {
    begin: 'css`',
    end: '',
    starts: {
      end: '`',
      returnEnd: false,
      contains: [
        hljs.BACKSLASH_ESCAPE,
        SUBST
      ],
      subLanguage: 'css'
    }
  };
  const TEMPLATE_STRING = {
    className: 'string',
    begin: '`',
    end: '`',
    contains: [
      hljs.BACKSLASH_ESCAPE,
      SUBST
    ]
  };
  const JSDOC_COMMENT = hljs.COMMENT(
    /\/\*\*(?!\/)/,
    '\\*/',
    {
      relevance: 0,
      contains: [
        {
          className: 'doctag',
          begin: '@[A-Za-z]+',
          contains: [
            {
              className: 'type',
              begin: '\\{',
              end: '\\}',
              relevance: 0
            },
            {
              className: 'variable',
              begin: IDENT_RE$1 + '(?=\\s*(-)|$)',
              endsParent: true,
              relevance: 0
            },
            // eat spaces (not newlines) so we can find
            // types or variables
            {
              begin: /(?=[^\n])\s/,
              relevance: 0
            }
          ]
        }
      ]
    }
  );
  const COMMENT = {
    className: "comment",
    variants: [
      JSDOC_COMMENT,
      hljs.C_BLOCK_COMMENT_MODE,
      hljs.C_LINE_COMMENT_MODE
    ]
  };
  const SUBST_INTERNALS = [
    hljs.APOS_STRING_MODE,
    hljs.QUOTE_STRING_MODE,
    HTML_TEMPLATE,
    CSS_TEMPLATE,
    TEMPLATE_STRING,
    NUMBER,
    hljs.REGEXP_MODE
  ];
  SUBST.contains = SUBST_INTERNALS
    .concat({
      // we need to pair up {} inside our subst to prevent
      // it from ending too early by matching another }
      begin: /\{/,
      end: /\}/,
      keywords: KEYWORDS$1,
      contains: [
        "self"
      ].concat(SUBST_INTERNALS)
    });
  const SUBST_AND_COMMENTS = [].concat(COMMENT, SUBST.contains);
  const PARAMS_CONTAINS = SUBST_AND_COMMENTS.concat([
    // eat recursive parens in sub expressions
    {
      begin: /\(/,
      end: /\)/,
      keywords: KEYWORDS$1,
      contains: ["self"].concat(SUBST_AND_COMMENTS)
    }
  ]);
  const PARAMS = {
    className: 'params',
    begin: /\(/,
    end: /\)/,
    excludeBegin: true,
    excludeEnd: true,
    keywords: KEYWORDS$1,
    contains: PARAMS_CONTAINS
  };

  return {
    name: 'Javascript',
    aliases: ['js', 'jsx', 'mjs', 'cjs'],
    keywords: KEYWORDS$1,
    // this will be extended by TypeScript
    exports: { PARAMS_CONTAINS },
    illegal: /#(?![$_A-z])/,
    contains: [
      hljs.SHEBANG({
        label: "shebang",
        binary: "node",
        relevance: 5
      }),
      {
        label: "use_strict",
        className: 'meta',
        relevance: 10,
        begin: /^\s*['"]use (strict|asm)['"]/
      },
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE,
      HTML_TEMPLATE,
      CSS_TEMPLATE,
      TEMPLATE_STRING,
      COMMENT,
      NUMBER,
      { // object attr container
        begin: concat(/[{,\n]\s*/,
          // we need to look ahead to make sure that we actually have an
          // attribute coming up so we don't steal a comma from a potential
          // "value" container
          //
          // NOTE: this might not work how you think.  We don't actually always
          // enter this mode and stay.  Instead it might merely match `,
          // <comments up next>` and then immediately end after the , because it
          // fails to find any actual attrs. But this still does the job because
          // it prevents the value contain rule from grabbing this instead and
          // prevening this rule from firing when we actually DO have keys.
          lookahead(concat(
            // we also need to allow for multiple possible comments inbetween
            // the first key:value pairing
            /(((\/\/.*$)|(\/\*(\*[^/]|[^*])*\*\/))\s*)*/,
            IDENT_RE$1 + '\\s*:'))),
        relevance: 0,
        contains: [
          {
            className: 'attr',
            begin: IDENT_RE$1 + lookahead('\\s*:'),
            relevance: 0
          }
        ]
      },
      { // "value" container
        begin: '(' + hljs.RE_STARTERS_RE + '|\\b(case|return|throw)\\b)\\s*',
        keywords: 'return throw case',
        contains: [
          COMMENT,
          hljs.REGEXP_MODE,
          {
            className: 'function',
            // we have to count the parens to make sure we actually have the
            // correct bounding ( ) before the =>.  There could be any number of
            // sub-expressions inside also surrounded by parens.
            begin: '(\\(' +
            '[^()]*(\\(' +
            '[^()]*(\\(' +
            '[^()]*' +
            '\\)[^()]*)*' +
            '\\)[^()]*)*' +
            '\\)|' + hljs.UNDERSCORE_IDENT_RE + ')\\s*=>',
            returnBegin: true,
            end: '\\s*=>',
            contains: [
              {
                className: 'params',
                variants: [
                  {
                    begin: hljs.UNDERSCORE_IDENT_RE,
                    relevance: 0
                  },
                  {
                    className: null,
                    begin: /\(\s*\)/,
                    skip: true
                  },
                  {
                    begin: /\(/,
                    end: /\)/,
                    excludeBegin: true,
                    excludeEnd: true,
                    keywords: KEYWORDS$1,
                    contains: PARAMS_CONTAINS
                  }
                ]
              }
            ]
          },
          { // could be a comma delimited list of params to a function call
            begin: /,/, relevance: 0
          },
          {
            className: '',
            begin: /\s/,
            end: /\s*/,
            skip: true
          },
          { // JSX
            variants: [
              { begin: FRAGMENT.begin, end: FRAGMENT.end },
              {
                begin: XML_TAG.begin,
                // we carefully check the opening tag to see if it truly
                // is a tag and not a false positive
                'on:begin': XML_TAG.isTrulyOpeningTag,
                end: XML_TAG.end
              }
            ],
            subLanguage: 'xml',
            contains: [
              {
                begin: XML_TAG.begin,
                end: XML_TAG.end,
                skip: true,
                contains: ['self']
              }
            ]
          }
        ],
        relevance: 0
      },
      {
        className: 'function',
        beginKeywords: 'function',
        end: /[{;]/,
        excludeEnd: true,
        keywords: KEYWORDS$1,
        contains: [
          'self',
          hljs.inherit(hljs.TITLE_MODE, { begin: IDENT_RE$1 }),
          PARAMS
        ],
        illegal: /%/
      },
      {
        // prevent this from getting swallowed up by function
        // since they appear "function like"
        beginKeywords: "while if switch catch for"
      },
      {
        className: 'function',
        // we have to count the parens to make sure we actually have the correct
        // bounding ( ).  There could be any number of sub-expressions inside
        // also surrounded by parens.
        begin: hljs.UNDERSCORE_IDENT_RE +
          '\\(' + // first parens
          '[^()]*(\\(' +
            '[^()]*(\\(' +
              '[^()]*' +
            '\\)[^()]*)*' +
          '\\)[^()]*)*' +
          '\\)\\s*\\{', // end parens
        returnBegin:true,
        contains: [
          PARAMS,
          hljs.inherit(hljs.TITLE_MODE, { begin: IDENT_RE$1 }),
        ]
      },
      // hack: prevents detection of keywords in some circumstances
      // .keyword()
      // $keyword = x
      {
        variants: [
          { begin: '\\.' + IDENT_RE$1 },
          { begin: '\\$' + IDENT_RE$1 }
        ],
        relevance: 0
      },
      { // ES6 class
        className: 'class',
        beginKeywords: 'class',
        end: /[{;=]/,
        excludeEnd: true,
        illegal: /[:"[\]]/,
        contains: [
          { beginKeywords: 'extends' },
          hljs.UNDERSCORE_TITLE_MODE
        ]
      },
      {
        begin: /\b(?=constructor)/,
        end: /[{;]/,
        excludeEnd: true,
        contains: [
          hljs.inherit(hljs.TITLE_MODE, { begin: IDENT_RE$1 }),
          'self',
          PARAMS
        ]
      },
      {
        begin: '(get|set)\\s+(?=' + IDENT_RE$1 + '\\()',
        end: /\{/,
        keywords: "get set",
        contains: [
          hljs.inherit(hljs.TITLE_MODE, { begin: IDENT_RE$1 }),
          { begin: /\(\)/ }, // eat to avoid empty params
          PARAMS
        ]
      },
      {
        begin: /\$[(.]/ // relevance booster for a pattern common to JS libs: `$(something)` and `$.something`
      }
    ]
  };
}

/*
Language: TypeScript
Author: Panu Horsmalahti <panu.horsmalahti@iki.fi>
Contributors: Ike Ku <dempfi@yahoo.com>
Description: TypeScript is a strict superset of JavaScript
Website: https://www.typescriptlang.org
Category: common, scripting
*/

/** @type LanguageFn */
function typescript(hljs) {
  const IDENT_RE$1 = IDENT_RE;
  const NAMESPACE = {
    beginKeywords: 'namespace', end: /\{/, excludeEnd: true
  };
  const INTERFACE = {
    beginKeywords: 'interface', end: /\{/, excludeEnd: true,
    keywords: 'interface extends'
  };
  const USE_STRICT = {
    className: 'meta',
    relevance: 10,
    begin: /^\s*['"]use strict['"]/
  };
  const TYPES = [
    "any",
    "void",
    "number",
    "boolean",
    "string",
    "object",
    "never",
    "enum"
  ];
  const TS_SPECIFIC_KEYWORDS = [
    "type",
    "namespace",
    "typedef",
    "interface",
    "public",
    "private",
    "protected",
    "implements",
    "declare",
    "abstract",
    "readonly"
  ];
  const KEYWORDS$1 = {
    $pattern: IDENT_RE,
    keyword: KEYWORDS.concat(TS_SPECIFIC_KEYWORDS).join(" "),
    literal: LITERALS.join(" "),
    built_in: BUILT_INS.concat(TYPES).join(" ")
  };
  const DECORATOR = {
    className: 'meta',
    begin: '@' + IDENT_RE$1,
  };

  const swapMode = (mode, label, replacement) => {
    const indx = mode.contains.findIndex(m => m.label === label);
    if (indx === -1) { throw new Error("can not find mode to replace"); }
    mode.contains.splice(indx, 1, replacement);
  };

  const tsLanguage = javascript(hljs);

  // this should update anywhere keywords is used since
  // it will be the same actual JS object
  Object.assign(tsLanguage.keywords, KEYWORDS$1);

  tsLanguage.exports.PARAMS_CONTAINS.push(DECORATOR);
  tsLanguage.contains = tsLanguage.contains.concat([
    DECORATOR,
    NAMESPACE,
    INTERFACE,
  ]);

  // TS gets a simpler shebang rule than JS
  swapMode(tsLanguage, "shebang", hljs.SHEBANG());
  // JS use strict rule purposely excludes `asm` which makes no sense
  swapMode(tsLanguage, "use_strict", USE_STRICT);

  const functionDeclaration = tsLanguage.contains.find(m => m.className === "function");
  functionDeclaration.relevance = 0; // () => {} is more typical in TypeScript

  Object.assign(tsLanguage, {
    name: 'TypeScript',
    aliases: ['ts']
  });

  return tsLanguage;
}

module.exports = typescript;

})();
(()=>{window.module={ set exports(fn) { hljs.registerLanguage('css', fn); } };
/*
Language: CSS
Category: common, css
Website: https://developer.mozilla.org/en-US/docs/Web/CSS
*/

/** @type LanguageFn */
function css(hljs) {
  var FUNCTION_LIKE = {
    begin: /[\w-]+\(/, returnBegin: true,
    contains: [
      {
        className: 'built_in',
        begin: /[\w-]+/
      },
      {
        begin: /\(/, end: /\)/,
        contains: [
          hljs.APOS_STRING_MODE,
          hljs.QUOTE_STRING_MODE,
          hljs.CSS_NUMBER_MODE,
        ]
      }
    ]
  };
  var ATTRIBUTE = {
    className: 'attribute',
    begin: /\S/, end: ':', excludeEnd: true,
    starts: {
      endsWithParent: true, excludeEnd: true,
      contains: [
        FUNCTION_LIKE,
        hljs.CSS_NUMBER_MODE,
        hljs.QUOTE_STRING_MODE,
        hljs.APOS_STRING_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        {
          className: 'number', begin: '#[0-9A-Fa-f]+'
        },
        {
          className: 'meta', begin: '!important'
        }
      ]
    }
  };
  var AT_IDENTIFIER = '@[a-z-]+'; // @font-face
  var AT_MODIFIERS = "and or not only";
  var AT_PROPERTY_RE = /@-?\w[\w]*(-\w+)*/; // @-webkit-keyframes
  var IDENT_RE = '[a-zA-Z-][a-zA-Z0-9_-]*';
  var RULE = {
    begin: /([*]\s?)?(?:[A-Z_.\-\\]+|--[a-zA-Z0-9_-]+)\s*(\/\*\*\/)?:/, returnBegin: true, end: ';', endsWithParent: true,
    contains: [
      ATTRIBUTE
    ]
  };

  return {
    name: 'CSS',
    case_insensitive: true,
    illegal: /[=|'\$]/,
    contains: [
      hljs.C_BLOCK_COMMENT_MODE,
      {
        className: 'selector-id', begin: /#[A-Za-z0-9_-]+/
      },
      {
        className: 'selector-class', begin: '\\.' + IDENT_RE
      },
      {
        className: 'selector-attr',
        begin: /\[/, end: /\]/,
        illegal: '$',
        contains: [
          hljs.APOS_STRING_MODE,
          hljs.QUOTE_STRING_MODE,
        ]
      },
      {
        className: 'selector-pseudo',
        begin: /:(:)?[a-zA-Z0-9_+()"'.-]+/
      },
      // matching these here allows us to treat them more like regular CSS
      // rules so everything between the {} gets regular rule highlighting,
      // which is what we want for page and font-face
      {
        begin: '@(page|font-face)',
        lexemes: AT_IDENTIFIER,
        keywords: '@page @font-face'
      },
      {
        begin: '@', end: '[{;]', // at_rule eating first "{" is a good thing
                                 // because it doesn’t let it to be parsed as
                                 // a rule set but instead drops parser into
                                 // the default mode which is how it should be.
        illegal: /:/, // break on Less variables @var: ...
        returnBegin: true,
        contains: [
          {
            className: 'keyword',
            begin: AT_PROPERTY_RE
          },
          {
            begin: /\s/, endsWithParent: true, excludeEnd: true,
            relevance: 0,
            keywords: AT_MODIFIERS,
            contains: [
              {
                begin: /[a-z-]+:/,
                className:"attribute"
              },
              hljs.APOS_STRING_MODE,
              hljs.QUOTE_STRING_MODE,
              hljs.CSS_NUMBER_MODE
            ]
          }
        ]
      },
      {
        className: 'selector-tag', begin: IDENT_RE,
        relevance: 0
      },
      {
        begin: /\{/, end: /\}/,
        illegal: /\S/,
        contains: [
          hljs.C_BLOCK_COMMENT_MODE,
          { begin: /;/ }, // empty ; rule
          RULE,
        ]
      }
    ]
  };
}

module.exports = css;

})();
(()=>{window.module={ set exports(fn) { hljs.registerLanguage('xml', fn); } };
/**
 * @param {string} value
 * @returns {RegExp}
 * */

/**
 * @param {RegExp | string } re
 * @returns {string}
 */
function source(re) {
  if (!re) return null;
  if (typeof re === "string") return re;

  return re.source;
}

/**
 * @param {RegExp | string } re
 * @returns {string}
 */
function lookahead(re) {
  return concat('(?=', re, ')');
}

/**
 * @param {RegExp | string } re
 * @returns {string}
 */
function optional(re) {
  return concat('(', re, ')?');
}

/**
 * @param {...(RegExp | string) } args
 * @returns {string}
 */
function concat(...args) {
  const joined = args.map((x) => source(x)).join("");
  return joined;
}

/**
 * Any of the passed expresssions may match
 *
 * Creates a huge this | this | that | that match
 * @param {(RegExp | string)[] } args
 * @returns {string}
 */
function either(...args) {
  const joined = '(' + args.map((x) => source(x)).join("|") + ")";
  return joined;
}

/*
Language: HTML, XML
Website: https://www.w3.org/XML/
Category: common
Audit: 2020
*/

/** @type LanguageFn */
function xml(hljs) {
  // Element names can contain letters, digits, hyphens, underscores, and periods
  const TAG_NAME_RE = concat(/[A-Z_]/, optional(/[A-Z0-9_.-]+:/), /[A-Z0-9_.-]*/);
  const XML_IDENT_RE = /[A-Za-z0-9._:-]+/;
  const XML_ENTITIES = {
    className: 'symbol',
    begin: /&[a-z]+;|&#[0-9]+;|&#x[a-f0-9]+;/
  };
  const XML_META_KEYWORDS = {
    begin: /\s/,
    contains: [
      {
        className: 'meta-keyword',
        begin: /#?[a-z_][a-z1-9_-]+/,
        illegal: /\n/
      }
    ]
  };
  const XML_META_PAR_KEYWORDS = hljs.inherit(XML_META_KEYWORDS, {
    begin: /\(/,
    end: /\)/
  });
  const APOS_META_STRING_MODE = hljs.inherit(hljs.APOS_STRING_MODE, {
    className: 'meta-string'
  });
  const QUOTE_META_STRING_MODE = hljs.inherit(hljs.QUOTE_STRING_MODE, {
    className: 'meta-string'
  });
  const TAG_INTERNALS = {
    endsWithParent: true,
    illegal: /</,
    relevance: 0,
    contains: [
      {
        className: 'attr',
        begin: XML_IDENT_RE,
        relevance: 0
      },
      {
        begin: /=\s*/,
        relevance: 0,
        contains: [
          {
            className: 'string',
            endsParent: true,
            variants: [
              {
                begin: /"/,
                end: /"/,
                contains: [ XML_ENTITIES ]
              },
              {
                begin: /'/,
                end: /'/,
                contains: [ XML_ENTITIES ]
              },
              {
                begin: /[^\s"'=<>`]+/
              }
            ]
          }
        ]
      }
    ]
  };
  return {
    name: 'HTML, XML',
    aliases: [
      'html',
      'xhtml',
      'rss',
      'atom',
      'xjb',
      'xsd',
      'xsl',
      'plist',
      'wsf',
      'svg'
    ],
    case_insensitive: true,
    contains: [
      {
        className: 'meta',
        begin: /<![a-z]/,
        end: />/,
        relevance: 10,
        contains: [
          XML_META_KEYWORDS,
          QUOTE_META_STRING_MODE,
          APOS_META_STRING_MODE,
          XML_META_PAR_KEYWORDS,
          {
            begin: /\[/,
            end: /\]/,
            contains: [
              {
                className: 'meta',
                begin: /<![a-z]/,
                end: />/,
                contains: [
                  XML_META_KEYWORDS,
                  XML_META_PAR_KEYWORDS,
                  QUOTE_META_STRING_MODE,
                  APOS_META_STRING_MODE
                ]
              }
            ]
          }
        ]
      },
      hljs.COMMENT(
        /<!--/,
        /-->/,
        {
          relevance: 10
        }
      ),
      {
        begin: /<!\[CDATA\[/,
        end: /\]\]>/,
        relevance: 10
      },
      XML_ENTITIES,
      {
        className: 'meta',
        begin: /<\?xml/,
        end: /\?>/,
        relevance: 10
      },
      {
        className: 'tag',
        /*
        The lookahead pattern (?=...) ensures that 'begin' only matches
        '<style' as a single word, followed by a whitespace or an
        ending braket. The '$' is needed for the lexeme to be recognized
        by hljs.subMode() that tests lexemes outside the stream.
        */
        begin: /<style(?=\s|>)/,
        end: />/,
        keywords: {
          name: 'style'
        },
        contains: [ TAG_INTERNALS ],
        starts: {
          end: /<\/style>/,
          returnEnd: true,
          subLanguage: [
            'css',
            'xml'
          ]
        }
      },
      {
        className: 'tag',
        // See the comment in the <style tag about the lookahead pattern
        begin: /<script(?=\s|>)/,
        end: />/,
        keywords: {
          name: 'script'
        },
        contains: [ TAG_INTERNALS ],
        starts: {
          end: /<\/script>/,
          returnEnd: true,
          subLanguage: [
            'javascript',
            'handlebars',
            'xml'
          ]
        }
      },
      // we need this for now for jSX
      {
        className: 'tag',
        begin: /<>|<\/>/
      },
      // open tag
      {
        className: 'tag',
        begin: concat(
          /</,
          lookahead(concat(
            TAG_NAME_RE,
            // <tag/>
            // <tag>
            // <tag ...
            either(/\/>/, />/, /\s/)
          ))
        ),
        end: /\/?>/,
        contains: [
          {
            className: 'name',
            begin: TAG_NAME_RE,
            relevance: 0,
            starts: TAG_INTERNALS
          }
        ]
      },
      // close tag
      {
        className: 'tag',
        begin: concat(
          /<\//,
          lookahead(concat(
            TAG_NAME_RE, />/
          ))
        ),
        contains: [
          {
            className: 'name',
            begin: TAG_NAME_RE,
            relevance: 0
          },
          {
            begin: />/,
            relevance: 0
          }
        ]
      }
    ]
  };
}

module.exports = xml;

})();
hljs.$STYLE=`
/*

Original highlight.js style (c) Ivan Sagalaev <maniac@softwaremaniacs.org>

*/

.hljs {
  display: block;
  overflow-x: auto;
  padding: 0.5em;
  background: #F0F0F0;
}


/* Base color: saturation 0; */

.hljs,
.hljs-subst {
  color: #444;
}

.hljs-comment {
  color: #888888;
}

.hljs-keyword,
.hljs-attribute,
.hljs-selector-tag,
.hljs-meta-keyword,
.hljs-doctag,
.hljs-name {
  font-weight: bold;
}


/* User color: hue: 0 */

.hljs-type,
.hljs-string,
.hljs-number,
.hljs-selector-id,
.hljs-selector-class,
.hljs-quote,
.hljs-template-tag,
.hljs-deletion {
  color: #880000;
}

.hljs-title,
.hljs-section {
  color: #880000;
  font-weight: bold;
}

.hljs-regexp,
.hljs-symbol,
.hljs-variable,
.hljs-template-variable,
.hljs-link,
.hljs-selector-attr,
.hljs-selector-pseudo {
  color: #BC6060;
}


/* Language color: hue: 90; */

.hljs-literal {
  color: #78A960;
}

.hljs-built_in,
.hljs-bullet,
.hljs-code,
.hljs-addition {
  color: #397300;
}


/* Meta color: hue: 200 */

.hljs-meta {
  color: #1f7199;
}

.hljs-meta-string {
  color: #4d99bf;
}


/* Misc effects */

.hljs-emphasis {
  font-style: italic;
}

.hljs-strong {
  font-weight: bold;
}

/*

Gruvbox style (dark) (c) Pavel Pertsev (original style at https://github.com/morhetz/gruvbox)

*/

.hljs {
  display: block;
  overflow-x: auto;
  padding: 0.5em;
  background: #282828;
}

.hljs,
.hljs-subst {
  color: #ebdbb2;
}

/* Gruvbox Red */
.hljs-deletion,
.hljs-formula,
.hljs-keyword,
.hljs-link,
.hljs-selector-tag {
  color: #fb4934;
}

/* Gruvbox Blue */
.hljs-built_in,
.hljs-emphasis,
.hljs-name,
.hljs-quote,
.hljs-strong,
.hljs-title,
.hljs-variable {
  color: #83a598;
}

/* Gruvbox Yellow */
.hljs-attr,
.hljs-params,
.hljs-template-tag,
.hljs-type {
  color: #fabd2f;
}

/* Gruvbox Purple */
.hljs-builtin-name,
.hljs-doctag,
.hljs-literal,
.hljs-number {
  color: #8f3f71;
}

/* Gruvbox Orange */
.hljs-code,
.hljs-meta,
.hljs-regexp,
.hljs-selector-id,
.hljs-template-variable {
  color: #fe8019;
}

/* Gruvbox Green */
.hljs-addition,
.hljs-meta-string,
.hljs-section,
.hljs-selector-attr,
.hljs-selector-class,
.hljs-string,
.hljs-symbol {
  color: #b8bb26;
}

/* Gruvbox Aqua */
.hljs-attribute,
.hljs-bullet,
.hljs-class,
.hljs-function,
.hljs-function .hljs-keyword,
.hljs-meta-keyword,
.hljs-selector-pseudo,
.hljs-tag {
  color: #8ec07c;
}

/* Gruvbox Gray */
.hljs-comment {
  color: #928374;
}

/* Gruvbox Purple */
.hljs-link_label,
.hljs-literal,
.hljs-number {
  color: #d3869b;
}

.hljs-comment,
.hljs-emphasis {
  font-style: italic;
}

.hljs-section,
.hljs-strong,
.hljs-tag {
  font-weight: bold;
}

`;
(cxl => {
	'use strict';

	const component = cxl.component,
		route = cxl.route,
		blog = (window.blog = {});
	cxl.css.extend({
		typography: {
			h3: {
				fontSize: 40,
				marginBottom: 32,
				marginTop: 32,
				fontWeight: 300,
			},
			h4: {
				fontSize: 32,
				fontStyle: 'italic',
				marginBottom: 32,
				marginTop: 32,
				fontWeight: 300,
			},
			h6: { fontSize: 24, fontWeight: 300 },
		},
	});

	hljs.configure({
		tabReplace: '    ',
	});

	component(
		{
			name: 'blog-demo',
			attributes: ['label', 'owner'],
			template: `
<cxl-t h6><span &="=label:show:text"></span></cxl-t>
<div &="content"></div>
<div &=".showMore">
	<a href="#" &=".link action:#toggleSource:event.prevent"><cxl-icon icon="code"></cxl-icon> <x &="=sourceLabel:text"></x></a>
</div>
<blog-code type="html" &=".source =displaySource:.show =source:@source"></blog-code>
`,

			styles: {
				$: { marginTop: 24, marginBottom: 24 },
				showMore: { textAlign: 'right', marginTop: 16 },
				source: { transformOrigin: 'top', scaleY: 0, height: 0 },
				show: { scaleY: 1, height: 'auto' },
				link: {
					color: 'primary',
					textDecoration: 'none',
					font: 'caption',
				},
			},

			initialize(state) {
				document.readyState !== 'loading'
					? state.connect(state, this)
					: window.addEventListener('DOMContentLoaded', () =>
							state.connect(state, this)
					  );
			},
		},
		{
			sourceLabel: 'Show Source',
			displaySource: false,

			toggleSource() {
				this.displaySource = !this.displaySource;
				this.sourceLabel = this.displaySource
					? 'Hide Source'
					: 'Show Source';
			},

			connect(val, host) {
				var state = this,
					owner = state.owner || host.$view,
					src,
					template;
				if (
					host.firstChild &&
					host.firstChild.nodeType === document.COMMENT_NODE
				) {
					src = host.firstChild.data;
					template = new cxl.Template(src);

					host.appendChild(template.compile(owner));
				} else src = host.innerHTML;

				host.$view.set('source', src.trim());
			},
		}
	);

	component(
		{
			name: 'blog-code',
			attributes: ['source', 'type', 'source-id'],
			template: `
<style>${hljs.$STYLE} .hljs { overflow: visible !important; }</style>
<div &="id(code) .code =source:text:#update"></div>
	`,

			styles: {
				$: { marginTop: 16, marginBottom: 16 },
				$lastChild: { marginBottom: 0 },
				code: {
					fontFamily: 'monospace',
					whiteSpace: 'pre-wrap',
					fontSize: 'var(--cxl-fontSize)',
					wordBreak: 'break-all',
				},
			},
			initialize(state) {
				document.readyState !== 'loading'
					? state.onReady(state, this)
					: window.addEventListener('DOMContentLoaded', () =>
							state.onReady(state, this)
					  );
			},
		},
		{
			type: '',

			update(source) {
				if (this.type) this.code.classList.toggle(this.type, true);
				hljs.highlightBlock(this.code);
			},

			onReady(val, el) {
				if (this['source-id'])
					el.source = document.getElementById(
						this['source-id']
					).innerHTML;
				else if (
					el.firstChild &&
					el.firstChild.nodeType === document.COMMENT_NODE
				)
					el.source = el.firstChild.data.trim();
				else if (el.innerHTML) el.source = el.innerHTML.trim();
			},
		}
	);

	component(
		{
			name: 'blog-tagline',
			styles: {
				$: { font: 'button', margin: 16 },
			},
			bindings: 'location:#getTagline:text',
		},
		{
			taglines: [
				'Make the world a better place, one bug at a time.',
				// 'Because no code is the best code.'
			],
			getTagline() {
				return this.taglines[
					(Math.random() * this.taglines.length) | 0
				];
			},
		}
	);

	component({
		name: 'blog-twitter',
		initialize() {
			twttr.ready(() => {
				twttr.widgets.createFollowButton('debuggerjs', this, {
					showCount: false,
				});
			});
		},
	});

	component({
		name: 'blog-tweet',
		attributes: ['tweet'],
		initialize() {
			twttr.ready(() => {
				twttr.widgets.createTweet(this.tweet, this); //, { showCount: false });
			});
		},
	});

	component({
		name: 'blog-footer',
		template: `
<div &="content"></div>
<footer>
	<br>
	<a &=".link" href=".">Back to Index</a>
	<br><br>
</footer>
	`,
		styles: {
			link: {
				display: 'block',
				textAlign: 'center',
				font: 'subtitle',
				color: 'link',
			},
		},
	});

	component({
		name: 'blog-header',
		template: `
<cxl-meta></cxl-meta>
<a &=".title" href="/index.html">debugger;</a>
<blog-tagline></blog-tagline>
	`,
		styles: {
			$: { textAlign: 'center', paddingTop: 32 },
			title: {
				font: 'h3',
				textDecoration: 'none',
				color: 'onSurface',
				fontFamily: 'monospace',
			},
			title$small: { font: 'h2', fontFamily: 'monospace' },
		},
	});

	component(
		{
			name: 'blog-meta',
			attributes: ['date', 'author'],
			template: `
<span &="=date:#formatDate:text"></span> by <a>@<span &="=author:text"></span></a>
	`,
			styles: {
				$: { font: 'subtitle', textAlign: 'center', marginBottom: 48 },
				$small: { font: 'h6' },
			},
		},
		{
			formatDate(val) {
				const options = {
						weekday: 'long',
						year: 'numeric',
						day: 'numeric',
						month: 'long',
					},
					date = val && new Date(val);
				return (
					date && date.toLocaleDateString(navigator.language, options)
				);
			},
		}
	);

	component({
		name: 'blog-container',
		styles: {
			$: {
				marginLeft: 16,
				marginRight: 16,
				backgroundColor: 'surface',
				color: 'onSurface',
			},
			$medium: { marginLeft: 32, marginRight: 32 },
			$large: { marginLeft: 64, marginRight: 64 },
			$xlarge: { width: 1200, marginLeft: 'auto', marginRight: 'auto' },
		},
	});

	component({
		name: 'blog-title',
		bindings: 'role(heading) aria.level(2)',
		styles: {
			$: { font: 'h4', textAlign: 'center', marginBottom: 16 },
			$small: { font: 'h2', marginBottom: 24 },
		},
	});

	component(
		{
			name: 'blog-posts',
			template: `
<cxl-t h3 &=".title">Notes</cxl-t>
<ul>
	<template &="=notes:sort(date):reverse:each:repeat">
	<li><a &=".link $title:text $id:#getUrl:@href"></a></li>
	</template>
</ul>
<cxl-t h3 &=".title">Demos</cxl-t>
<ul>
	<template &="=demos:sort(date):reverse:each:repeat">
	<li><a &=".link $title:text $id:#getUrl:@href"></a></li>
	</template>
</ul>
<cxl-t h3 &="=drafts.length:show .title">Drafts</cxl-t>
<ul>
	<template &="=drafts:sort(date):reverse:each:repeat">
	<li><a &=".link $title:text $id:#getUrl:@href"></a></li>
	</template>
</ul>
	`,
			styles: {
				title: { textAlign: 'center' },
				link: {
					font: 'h6',
					color: 'link',
					marginBottom: 16,
					display: 'inline-block',
				},
			},
			initialize(state) {
				cxl.ajax.get('posts.json').then(res => {
					const posts = [],
						demos = [],
						drafts = [],
						notes = [];
					res.forEach(post => {
						if (post.type === 'demo') demos.push(post);
						else if (post.type === 'notes') notes.push(post);
						else if (location.host.indexOf('debuggerjs.com') === -1)
							drafts.push(post);
					});

					state.posts = posts;
					state.demos = demos;
					state.drafts = drafts;
					this.$view.set('notes', notes);
				});
			},
		},
		{
			getUrl(id) {
				return 'posts/' + id;
			},
		}
	);

	component({
		name: 'blog-content',
		bindings: 'location:route',
	});

	component(
		{
			name: 'blog-mdn',
			attributes: ['href'],
			template: '<a &="=href:#setHref content .link"></a>',
			styles: {
				$: { display: 'inline' },
				link: { color: 'link', font: 'code' },
			},
		},
		{
			setHref(href, el) {
				if (href)
					el.href =
						'https://developer.mozilla.org/en-US/docs/Web/' + href;
			},
		}
	);

	component({
		name: 'blog-main-tweet',
		extend: 'blog-tweet',
	});

	component({
		name: 'blog-tags',
		attributes: ['tags'],
		template: `
<cxl-t h6>Tags</cxl-t>
<template &="=tags:each:repeat">
<cxl-chip primary &="item:text"></cxl-chip>
</template>
	`,
		initialize(state) {
			function onMutate(el) {
				el.tags = el.innerHTML.split(' ');
			}

			document.readyState !== 'loading'
				? onMutate(this)
				: window.addEventListener('DOMContentLoaded', () =>
						onMutate(this)
				  );
		},
	});

	component({
		name: 'blog-post',
		template: `
<div &="content"></div>
<blog-footer>
	<div &=".container">
		<div &=".tags content(blog-tags)"></div>
		<div &=".tweet content(blog-main-tweet)"></div>
	</div>
</blog-footer>
	`,
		styles: {
			container$medium: {
				display: 'flex',
				marginTop: 48,
				marginBottom: 32,
			},
			tags: { flexGrow: 1 },
		},
	});

	route({
		path: 'home',
		defaultRoute: true,
		template: `
<blog-posts></blog-posts>
	`,
	});

	// TODO clean up? Move to @cxl/template ?
	function run(code) {
		new Function(code).call();
	}

	function setContent(val, el) {
		// NOTE Use a fragment instead of innerHTML to prevent webkit bug.
		const html = cxl.Template.getFragmentFromString(val);
		el.appendChild(html);
		const scripts = el.querySelectorAll('script');
		const source = [];

		// TODO dangerous?
		for (let code of scripts)
			if (!code.type || code.type === 'application/javascript')
				source.push(code.src ? cxl.ajax.get(code.src) : code.innerHTML);

		el.style.opacity = 1;
		Promise.all(source).then(code => run(code.join('\n')));
	}

	route(
		{
			path: 'posts/:postId',
			extend: 'blog-post',
			attributes: ['content'],
			bindings: '=content:resolve:#setContent',
			resolve(state) {
				state.content = cxl.ajax.get('posts/' + state.postId + '.html');
			},
		},
		{
			setContent: setContent,
		}
	);

	route(
		{
			path: 'drafts/:postId',
			extend: 'blog-post',
			attributes: ['content'],
			bindings: '=content:resolve:#setContent',
			resolve(state) {
				state.content = cxl.ajax.get(
					'../drafts/' + state.postId + '.html'
				);
			},
		},
		{
			setContent: setContent,
		}
	);

	Object.assign(blog, {
		id(elId) {
			return document.getElementById(elId);
		},

		compile(el, state) {
			const owner = new cxl.View(state, el);
			cxl.compiler.compile(el, owner);
			owner.connect();
		},

		getScript(url) {
			return cxl.ajax.get(url).then(run);
		},
	});
})(this.cxl);
