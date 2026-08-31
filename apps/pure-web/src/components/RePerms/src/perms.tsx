import { defineComponent, Fragment } from 'vue';
import { hasPerms } from '@/utils/auth';

export default defineComponent({
  name: 'Perms',
  props: {
    value: {
      type: undefined,
      default: []
    }
  },
  setup(props, { slots }) {
    return () => {
      return hasPerms(props.value) ? (
        <Fragment>{slots.default?.()}</Fragment>
      ) : null;
    };
  }
});
