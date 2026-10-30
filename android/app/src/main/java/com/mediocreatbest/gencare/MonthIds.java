package com.mediocreatbest.gencare;

/**
 * The Month widget's 42 squares, by view id (res/layout/widget_month.xml,
 * which is generated the same way: square i is c{i}, its day number d{i},
 * its two event chips e{i}a / e{i}b with color k{i}a / k{i}b and text
 * t{i}a / t{i}b, and its "+2 more" m{i}).
 */
final class MonthIds {
    private MonthIds() {
    }

    static final int[] ROWS = { R.id.r0, R.id.r1, R.id.r2, R.id.r3, R.id.r4, R.id.r5 };
    static final int[] CELL = {
        R.id.c0, R.id.c1, R.id.c2, R.id.c3, R.id.c4, R.id.c5, R.id.c6,
        R.id.c7, R.id.c8, R.id.c9, R.id.c10, R.id.c11, R.id.c12, R.id.c13,
        R.id.c14, R.id.c15, R.id.c16, R.id.c17, R.id.c18, R.id.c19, R.id.c20,
        R.id.c21, R.id.c22, R.id.c23, R.id.c24, R.id.c25, R.id.c26, R.id.c27,
        R.id.c28, R.id.c29, R.id.c30, R.id.c31, R.id.c32, R.id.c33, R.id.c34,
        R.id.c35, R.id.c36, R.id.c37, R.id.c38, R.id.c39, R.id.c40, R.id.c41
    };
    static final int[] DAY = {
        R.id.d0, R.id.d1, R.id.d2, R.id.d3, R.id.d4, R.id.d5, R.id.d6,
        R.id.d7, R.id.d8, R.id.d9, R.id.d10, R.id.d11, R.id.d12, R.id.d13,
        R.id.d14, R.id.d15, R.id.d16, R.id.d17, R.id.d18, R.id.d19, R.id.d20,
        R.id.d21, R.id.d22, R.id.d23, R.id.d24, R.id.d25, R.id.d26, R.id.d27,
        R.id.d28, R.id.d29, R.id.d30, R.id.d31, R.id.d32, R.id.d33, R.id.d34,
        R.id.d35, R.id.d36, R.id.d37, R.id.d38, R.id.d39, R.id.d40, R.id.d41
    };
    static final int[] MORE = {
        R.id.m0, R.id.m1, R.id.m2, R.id.m3, R.id.m4, R.id.m5, R.id.m6,
        R.id.m7, R.id.m8, R.id.m9, R.id.m10, R.id.m11, R.id.m12, R.id.m13,
        R.id.m14, R.id.m15, R.id.m16, R.id.m17, R.id.m18, R.id.m19, R.id.m20,
        R.id.m21, R.id.m22, R.id.m23, R.id.m24, R.id.m25, R.id.m26, R.id.m27,
        R.id.m28, R.id.m29, R.id.m30, R.id.m31, R.id.m32, R.id.m33, R.id.m34,
        R.id.m35, R.id.m36, R.id.m37, R.id.m38, R.id.m39, R.id.m40, R.id.m41
    };
    static final int[] CHIP_A = {
        R.id.e0a, R.id.e1a, R.id.e2a, R.id.e3a, R.id.e4a, R.id.e5a, R.id.e6a,
        R.id.e7a, R.id.e8a, R.id.e9a, R.id.e10a, R.id.e11a, R.id.e12a, R.id.e13a,
        R.id.e14a, R.id.e15a, R.id.e16a, R.id.e17a, R.id.e18a, R.id.e19a, R.id.e20a,
        R.id.e21a, R.id.e22a, R.id.e23a, R.id.e24a, R.id.e25a, R.id.e26a, R.id.e27a,
        R.id.e28a, R.id.e29a, R.id.e30a, R.id.e31a, R.id.e32a, R.id.e33a, R.id.e34a,
        R.id.e35a, R.id.e36a, R.id.e37a, R.id.e38a, R.id.e39a, R.id.e40a, R.id.e41a
    };
    static final int[] COLOR_A = {
        R.id.k0a, R.id.k1a, R.id.k2a, R.id.k3a, R.id.k4a, R.id.k5a, R.id.k6a,
        R.id.k7a, R.id.k8a, R.id.k9a, R.id.k10a, R.id.k11a, R.id.k12a, R.id.k13a,
        R.id.k14a, R.id.k15a, R.id.k16a, R.id.k17a, R.id.k18a, R.id.k19a, R.id.k20a,
        R.id.k21a, R.id.k22a, R.id.k23a, R.id.k24a, R.id.k25a, R.id.k26a, R.id.k27a,
        R.id.k28a, R.id.k29a, R.id.k30a, R.id.k31a, R.id.k32a, R.id.k33a, R.id.k34a,
        R.id.k35a, R.id.k36a, R.id.k37a, R.id.k38a, R.id.k39a, R.id.k40a, R.id.k41a
    };
    static final int[] TEXT_A = {
        R.id.t0a, R.id.t1a, R.id.t2a, R.id.t3a, R.id.t4a, R.id.t5a, R.id.t6a,
        R.id.t7a, R.id.t8a, R.id.t9a, R.id.t10a, R.id.t11a, R.id.t12a, R.id.t13a,
        R.id.t14a, R.id.t15a, R.id.t16a, R.id.t17a, R.id.t18a, R.id.t19a, R.id.t20a,
        R.id.t21a, R.id.t22a, R.id.t23a, R.id.t24a, R.id.t25a, R.id.t26a, R.id.t27a,
        R.id.t28a, R.id.t29a, R.id.t30a, R.id.t31a, R.id.t32a, R.id.t33a, R.id.t34a,
        R.id.t35a, R.id.t36a, R.id.t37a, R.id.t38a, R.id.t39a, R.id.t40a, R.id.t41a
    };
    static final int[] CHIP_B = {
        R.id.e0b, R.id.e1b, R.id.e2b, R.id.e3b, R.id.e4b, R.id.e5b, R.id.e6b,
        R.id.e7b, R.id.e8b, R.id.e9b, R.id.e10b, R.id.e11b, R.id.e12b, R.id.e13b,
        R.id.e14b, R.id.e15b, R.id.e16b, R.id.e17b, R.id.e18b, R.id.e19b, R.id.e20b,
        R.id.e21b, R.id.e22b, R.id.e23b, R.id.e24b, R.id.e25b, R.id.e26b, R.id.e27b,
        R.id.e28b, R.id.e29b, R.id.e30b, R.id.e31b, R.id.e32b, R.id.e33b, R.id.e34b,
        R.id.e35b, R.id.e36b, R.id.e37b, R.id.e38b, R.id.e39b, R.id.e40b, R.id.e41b
    };
    static final int[] COLOR_B = {
        R.id.k0b, R.id.k1b, R.id.k2b, R.id.k3b, R.id.k4b, R.id.k5b, R.id.k6b,
        R.id.k7b, R.id.k8b, R.id.k9b, R.id.k10b, R.id.k11b, R.id.k12b, R.id.k13b,
        R.id.k14b, R.id.k15b, R.id.k16b, R.id.k17b, R.id.k18b, R.id.k19b, R.id.k20b,
        R.id.k21b, R.id.k22b, R.id.k23b, R.id.k24b, R.id.k25b, R.id.k26b, R.id.k27b,
        R.id.k28b, R.id.k29b, R.id.k30b, R.id.k31b, R.id.k32b, R.id.k33b, R.id.k34b,
        R.id.k35b, R.id.k36b, R.id.k37b, R.id.k38b, R.id.k39b, R.id.k40b, R.id.k41b
    };
    static final int[] TEXT_B = {
        R.id.t0b, R.id.t1b, R.id.t2b, R.id.t3b, R.id.t4b, R.id.t5b, R.id.t6b,
        R.id.t7b, R.id.t8b, R.id.t9b, R.id.t10b, R.id.t11b, R.id.t12b, R.id.t13b,
        R.id.t14b, R.id.t15b, R.id.t16b, R.id.t17b, R.id.t18b, R.id.t19b, R.id.t20b,
        R.id.t21b, R.id.t22b, R.id.t23b, R.id.t24b, R.id.t25b, R.id.t26b, R.id.t27b,
        R.id.t28b, R.id.t29b, R.id.t30b, R.id.t31b, R.id.t32b, R.id.t33b, R.id.t34b,
        R.id.t35b, R.id.t36b, R.id.t37b, R.id.t38b, R.id.t39b, R.id.t40b, R.id.t41b
    };
}
