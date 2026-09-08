import type { JSX as ReactJSX } from 'react'
import type { SalinApi } from '../preload/index'

declare global {
  // React 19 removed the global JSX namespace; re-expose it for the components.
  namespace JSX {
    type Element = ReactJSX.Element
    type ElementType = ReactJSX.ElementType
    interface ElementClass extends ReactJSX.ElementClass {}
    interface ElementAttributesProperty extends ReactJSX.ElementAttributesProperty {}
    interface ElementChildrenAttribute extends ReactJSX.ElementChildrenAttribute {}
    interface IntrinsicAttributes extends ReactJSX.IntrinsicAttributes {}
    interface IntrinsicElements extends ReactJSX.IntrinsicElements {}
  }

  interface Window {
    salin: SalinApi
  }
}

export {}
