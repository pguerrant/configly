const expect = require('assertly').expect;
const Base = require('../../src/Base.js');

const { junction, mixinId } = require('../../src/decorators');

describe('Base', function () {
    describe('life-cycle', function () {
        let C, D, M;
        let log;

        beforeEach(function () {
            log = [];

            C = class c extends Base {
                foo (x) {
                    log.push('C.foo=' + x);
                    return 'c' + x;
                }
            };

            @mixinId('mixum')
            class m extends Base {
                foo (x) {
                    log.push('M.foo=' + x);
                    return 'm' + x;
                }
            };
            M = m;

            D = class d extends C {
                @junction
                foo (x) {
                    let r = super.foo(x);
                    log.push('D.foo=' + x);
                    return 'd' + r;
                }
            }
        });

        it('should be able to create an instance', function () {
            let instance = new C();
            let res = instance.foo(42);

            expect(res).to.be('c42');
            expect(log).to.equal([ 'C.foo=42' ]);
        });

        it('should be able to create derived instance', function () {
            let instance = new D();
            let res = instance.foo(42);

            expect(res).to.be('dc42');
            expect(log).to.equal([ 'C.foo=42', 'D.foo=42' ]);
        });

        it('should be able to mixin', function () {
            // D.Junction(null, null, {
            //     value: D.prototype.foo
            // });

            D.mix(M);

            let instance = new D();
            let res = instance.foo(42);

            expect(res).to.be('dc42');
            expect(log).to.equal([ 'C.foo=42', 'M.foo=42', 'D.foo=42' ]);
        });
    });
});
