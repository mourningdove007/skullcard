use std::convert::TryInto;

use halo2_poseidon::poseidon::{
    primitives::ConstantLength,
    Hash, Pow5Chip, Pow5Config,
};
use halo2_proofs::{
    circuit::{Layouter, SimpleFloorPlanner, Value},
    plonk::{Advice, Circuit, Column, ConstraintSystem, Error},
};
use halo2curves::bn256::Fr as Fp;

use crate::poseidon_bn256::PoseidonBn256Spec;

#[derive(Clone)]
pub(crate) struct PoseidonCircuitConfig {
    poseidon: Pow5Config<Fp, 3, 2>,
    msg_cols: [Column<Advice>; 2],
    out_col: Column<Advice>,
}

pub(crate) struct PoseidonHashCircuit {
    pub message: Value<[Fp; 2]>,
    pub output: Value<Fp>,
}

impl Circuit<Fp> for PoseidonHashCircuit {
    type Config = PoseidonCircuitConfig;
    type FloorPlanner = SimpleFloorPlanner;

    fn without_witnesses(&self) -> Self {
        Self { message: Value::unknown(), output: Value::unknown() }
    }

    fn configure(meta: &mut ConstraintSystem<Fp>) -> Self::Config {
        let msg_cols = [meta.advice_column(), meta.advice_column()];
        let out_col = meta.advice_column();
        for col in msg_cols.iter().chain(std::iter::once(&out_col)) {
            meta.enable_equality(*col);
        }

        let state = [meta.advice_column(), meta.advice_column(), meta.advice_column()];
        let partial_sbox = meta.advice_column();
        let rc_a = [meta.fixed_column(), meta.fixed_column(), meta.fixed_column()];
        let rc_b = [meta.fixed_column(), meta.fixed_column(), meta.fixed_column()];
        meta.enable_constant(rc_b[0]);

        let poseidon = Pow5Chip::configure::<PoseidonBn256Spec>(meta, state, partial_sbox, rc_a, rc_b);
        PoseidonCircuitConfig { poseidon, msg_cols, out_col }
    }

    fn synthesize(
        &self,
        config: Self::Config,
        mut layouter: impl Layouter<Fp>,
    ) -> Result<(), Error> {
        let chip = Pow5Chip::construct(config.poseidon.clone());

        let message: [_; 2] = layouter.assign_region(
            || "load message",
            |mut region| {
                let cells: Result<Vec<_>, Error> = config
                    .msg_cols
                    .iter()
                    .enumerate()
                    .map(|(i, &col)| {
                        region.assign_advice(|| format!("message_{i}"), col, 0, || {
                            self.message.map(|m| m[i])
                        })
                    })
                    .collect();
                Ok(cells?.try_into().unwrap())
            },
        )?;

        let hasher = Hash::<_, _, PoseidonBn256Spec, ConstantLength<2>, 3, 2>::init(
            chip,
            layouter.namespace(|| "init"),
        )?;
        let output = hasher.hash(layouter.namespace(|| "hash"), message)?;

        layouter.assign_region(
            || "constrain output",
            |mut region| {
                let expected = region.assign_advice(
                    || "expected output",
                    config.out_col,
                    0,
                    || self.output,
                )?;
                region.constrain_equal(output.cell(), expected.cell())
            },
        )
    }
}
