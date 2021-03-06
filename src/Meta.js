'use strict';

const Config = require('./Config.js');
const Util = require('./Util.js');
const Empty = Util.Empty;

const chainOwnerSym = Symbol('chainOwner');

let mixinIdSeed = 0;

let getOwnNames = Object.getOwnPropertyNames;
let getOwnSymbols = Object.getOwnPropertySymbols;

let getOwnKeys = getOwnSymbols ? function (object) {
        let keys = getOwnNames(object);
        let syms = getOwnSymbols(object);

        if (keys.length) {
            if (syms.length) {
                keys.push(...syms);
            }
        }
        else {
            keys = syms;
        }

        return keys;
    } : getOwnNames;

function getOwnProps (object) {
    let ret = {
        obj: object,
        keys: getOwnKeys(object),
        props: new Empty(),
        statics: null
    };

    for (let key of ret.keys) {
        ret.props[key] = Object.getOwnPropertyDescriptor(object, key);
    }

    return ret;
}

class Meta {
    constructor (cls, superclass = null) {
        let me = this;
        let proto = cls.prototype;
        let superMeta = superclass && superclass.getMeta();
        let $meta = {
            value: me
        };

        Object.defineProperty(cls, '$meta', $meta);
        Object.defineProperty(proto, '$meta', $meta);

        me.id = (cls.name || '') + '$' + ++Meta.count;
        me.class = cls;
        me.super = superMeta;

        cls.super = superclass;
        proto.super = superclass && superclass.prototype;

        if (superclass) {
            me.bases = superMeta.bases.clone();
            me.bases.add(superclass);

            // Since many classes the the hierarchy can *implement* a chained method,
            // we don't try to save on this map creation. This is prototype chained to
            // the superclass's liveChains and only keys with a value of true are put
            // in the map. This ensures that methods in base classes will "activate" a
            // chained method.
            me.liveChains = Object.create(superMeta.liveChains);
        }
        else {
            me.bases = new Util.Set();

            // Defining new chains is rare so we only create this map for Base. The
            // getChains() method will walk up the supers and return the first class
            // to have defined method chains (which is Base typically).
            me.chains = new Empty();

            me.liveChains = new Empty();
        }
    }

    complete () {
        let cls = this.class;

        this.completed = true;
        this.complete = Util.nullFn;

        (this.classes = this.bases.clone()).add(cls);

        let sup = this.super;

        if (sup && !sup.completed) {
            sup.complete();
        }
    }

    addChains (...methods) {
        let chains = this.getChains(true);
        let proto = this.class.prototype;

        for (let m of methods) {
            // Assume all chained methods are live initially.
            this.liveChains[m] = chains[m] = true;

            let name = m + 'Chain';

            Object.defineProperty(proto, name, {
                value: this.createChainInvoker(m)
            });
            Object.defineProperty(proto, name + 'Rev', {
                value: this.createChainInvoker(m, true)
            });
        }
    }

    addConfigs (configs) {
        //
    }

    addMixin (mixinMeta, mixinId) {
        if (this.completed) {
            Util.raise(`Too late apply a mixin into this class`);
        }

        mixinMeta.complete();

        let mix = mixinMeta.class;

        this.bases.addAll(mixinMeta.bases).add(mix);

        if (!mixinId) {
            mixinId = mixinMeta.getMixinId();
        }

        if (mixinId) {
            let mixins = this.getMixins();

            if (!mixins[mixinId]) {
                mixins[mixinId] = mix;
                this.class.prototype.mixins[mixinId] = mix.prototype;
            }
        }
    }

    getChains (own) {
        let chains = this.chains;

        if (!chains) {
            let sup = this.super;

            if (own) {
                this.chains = chains = Object.create(sup.getChains(true));
            }
            else {
                for (; !chains && sup; sup = sup.super) {
                    chains = sup.chains;
                }
            }
        }

        return chains;
    }

    getMembers () {
        if (!this.completed) {
            Util.raise('Class is incomplete');
        }

        let cls = this.class;
        let members = this.members;

        if (!members) {
            this.members = members = getOwnProps(cls.prototype);
            members.statics = getOwnProps(cls);
        }

        return members;
    }

    getMixinId () {
        let mixinId = this.mixinId;
        let cls = this.class;
        let MixinIdSymbol = cls.MixinIdSymbol;

        if (!mixinId) {
            if (cls.hasOwnProperty(MixinIdSymbol)) {
                mixinId = cls[MixinIdSymbol];
            }
            else {
                mixinId = (this.class.name || 'mixin') + '$' + ++mixinIdSeed;
                mixinId = Util.decapitalize(mixinId);
            }

            this.mixinId = mixinId;
        }

        return mixinId;
    }

    getMixins (isStatic) {
        let cls = this.class;
        let proto = cls.prototype;

        if (!cls.hasOwnProperty('mixins')) {
            let sup = this.super;

            cls.mixins = (sup ? Object.create(sup.getMixins(true)) : new Empty());
            proto.mixins = (sup ? Object.create(sup.getMixins()) : new Empty());
        }

        return (isStatic ? cls : proto).mixins;
    }

    getShim (isStatic = true) {
        let shim = this.shim;

        if (!shim) {
            this.shim = shim = this.createShim();
        }

        return isStatic ? shim : shim.prototype;
    }

    invokeMethodChain (instance, reverse, method, args) {
        let classes = this.classes;
        let calls = 0;

        if (reverse) {
            classes = this.classesRev || (this.classesRev = Array.from(classes).reverse());
        }

        for (let cls of classes) {
            let proto = cls.prototype;
            let fn = proto[method];

            if (fn && proto.hasOwnProperty(method)) {
                ++calls;

                if (args) {
                    fn.apply(instance, args);
                }
                else {
                    fn.call(instance);
                }
            }
        }

        return calls;
    }

    //----------------------------------------------------------------------
    // Private

    createChainInvoker (name, reverse) {
        let me = this;
        let liveChains = me.liveChains;

        return function (...args) {
            if (liveChains[name]) {
                if (!me.invokeMethodChain(this, reverse, name, args)) {
                    liveChains[name] = false;
                }
            }
        };
    }

    createShim () {
        let cls = this.class;
        let base = cls.super;

        class Shim extends base {}

        Util.setProto(cls, Shim);
        Util.setProto(cls.prototype, Shim.prototype);

        return Shim;
    }
}

Meta.count = 0;

Object.assign(Meta.prototype, {
    chains: null,
    classes: null,
    classesRev: null,
    completed: false,

    instances: 0,

    members: null
});

module.exports = Meta;
